// Copyright IBM Corp. 2014,2016. All Rights Reserved.
// Node module: strong-pm
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

var Docker = require('dockerode');
var Environment = require('./env');
var Parser = require('posix-getopt').BasicParser;
var async = require('async');
var auth = require('./auth');
var debug = require('debug')('strong-pm:install');
var fs = require('fs');
var path = require('path');
var slServiceInstall = require('strong-service-install');

module.exports = install;

function printHelp($0, prn) {
  var usageFile = require.resolve('../bin/sl-pm-install.txt');
  var USAGE = fs.readFileSync(usageFile, 'utf-8')
                .replace(/%MAIN%/g, $0)
                .trim();
  prn(USAGE);
}

function install(argv, callback) {
  var $0 = process.env.CMD || path.basename(argv[1]);
  var parser = new Parser([
    ':v(version)',
    'h(help)',
    'b:(base)',
    'e:(set-env)',
    'u:(user)',
    'p:(port)',
    'j:(job-file)',
    'n(dry-run)',
    'f(force)',
    'i:(upstart)', // -i unused, posix-getopt doesn't do long-only options
    's(systemd)',
    'm:(metrics)',
    'a:(http-auth)',
    'd:(driver)',
    'P:(base-port)',
    'I(skip-default-install)',
  ].join(''),
  argv);

  var jobConfig = {
    user: 'strong-pm',
    pmBaseDir: null,
    pmPort: 8701,
    basePort: 3000,
    driver: 'direct',
    dryRun: false,
    jobFile: null, // strong-service-install provides an init-specific default
    force: false,
    upstart: false,
    systemd: false,
    env: {},
    pmEnv: '',
    pmSeedEnv: {},
    _touched: [], // not a real config, used for recording paths to chown
    dirs: [],
  };

  var option;
  while ((option = parser.getopt()) !== undefined) {
    switch (option.option) {
      case 'v':
        console.log(require('../package.json').version);
        return callback();
      case 'h':
        printHelp($0, console.log);
        return callback();
      case 'b':
        jobConfig.pmBaseDir = option.optarg;
        jobConfig.dirs.push(jobConfig.pmBaseDir);
        break;
      case 'd':
        jobConfig.driver = option.optarg;
        break;
      case 'e':
        jobConfig.pmEnv = option.optarg;
        break;
      case 'p':
        jobConfig.pmPort = option.optarg;
        break;
      case 'P':
        jobConfig.basePort = option.optarg;
        break;
      case 'u':
        jobConfig.user = option.optarg;
        break;
      case 'j':
        jobConfig.jobFile = option.optarg;
        break;
      case 'n':
        jobConfig.dryRun = true;
        break;
      case 'f':
        jobConfig.force = true;
        break;
      case 'i': // actually --upstart
        jobConfig.upstart = option.optarg;
        break;
      case 's':
        jobConfig.systemd = true;
        break;
      case 'm':
        jobConfig.pmSeedEnv.STRONGLOOP_METRICS = option.optarg;
        break;
      case 'a':
        jobConfig.env.STRONGLOOP_PM_HTTP_AUTH =
          auth.parse(option.optarg).normalized;
        break;
      case 'I': // --skip-default-install
        jobConfig.env.STRONGLOOP_PM_SKIP_DEFAULT_INSTALL = 'true';
        break;
      default:
        console.error('Invalid usage (near option \'%s\'), try `%s --help`.',
          option.optopt, $0);
        return callback(Error('usage'));
    }
  }

  if (parser.optind() !== argv.length) {
    console.error('Invalid usage (extra arguments), try `%s --help`.', $0);
    return callback(Error('usage'));
  }

  if (!(jobConfig.pmPort > 0)) {
    console.error('Port %j is not valid, try `%s --help`.',
                  jobConfig.pmPort, $0);
    return callback(Error('usage'));
  }

  if (!(jobConfig.basePort > 0)) {
    console.error('Base port %j is not valid, try `%s --help`.',
                  jobConfig.basePort, $0);
    return callback(Error('usage'));
  }

  if (!jobConfig.systemd && !jobConfig.upstart) {
    jobConfig.upstart = '1.4'; // default
  } else if (jobConfig.systemd && jobConfig.upstart) {
    console.error(
      'Invalid usage (cannot specify both --systemd and --upstart)' +
      ', see `%s --help`', $0);
    return callback(Error('usage'));
  }
  if (!jobConfig.systemd &&
      jobConfig.upstart !== '0.6' && jobConfig.upstart !== '1.4') {
    console.error('Invalid usage (only upstart "0.6" and "1.4" supported)' +
                  ', see `%s --help`', $0);
    return callback(Error('usage'));
  }

  if (jobConfig.env.STRONGLOOP_PM_HTTP_AUTH &&
      auth.parse(jobConfig.env.STRONGLOOP_PM_HTTP_AUTH).scheme === 'none') {
    console.error(
      'Bad http-auth specification: %s', jobConfig.env.STRONGLOOP_PM_HTTP_AUTH);
    return callback(Error('usage'));
  }

  if (!/^(direct|docker)$/.test(jobConfig.driver)) {
    console.error('Invalid driver: %s', jobConfig.driver);
    return callback(Error('usage'));
  }

  if (jobConfig.upstart === '0.6' && jobConfig.driver === 'docker') {
    console.error('Upstart 0.6 does not support setgid. Please run:\n' +
                  '   "sudo usermod -aG docker %s".', jobConfig.user);
  }

  if (jobConfig.driver === 'docker') {
    jobConfig.group = 'docker';
  }

  jobConfig.name = 'strong-pm';
  jobConfig.description = 'StrongLoop Process Manager';
  jobConfig.command = [
    process.execPath,
    require.resolve('../bin/sl-pm'),
    '--listen', jobConfig.pmPort,
    '--driver', jobConfig.driver,
    // --base is added in fixupCommand, after $HOME and $CWD get resovled
  ];
  jobConfig.preWrite = fixupCommand;

  var steps = [
    ensureDocker,
    slServiceInstall,
  ].map(w);

  return async.applyEachSeries(steps, jobConfig, report);

  function report(err) {
    if (err) {
      console.error('Error installing service \'%s\':',
                    jobConfig.name, err.message);
    }
    return callback(err);
  }

  function w(fn) {
    return function(opts, cb) {
      debug('enter', fn.name);
      fn(opts, function(err) {
        debug('exit', fn.name, err);
        cb.apply(this, arguments);
      });
    };
  }
}

function ensureDocker(options, callback) {
  if (options.driver === 'docker') {
    var docker = new Docker();
    docker.info(function(err) {
      if (err) {
        console.error('Docker not usable:', err);
      }
      callback(err);
    });
  } else {
    setImmediate(callback);
  }
}

// done after strong-service-install has resolved $HOME and $CWD appropriately
function fixupCommand(options, callback) {
  if (!options.pmBaseDir) {
    if (fs.existsSync(path.resolve(options.cwd, '.strong-pm'))) {
      options.pmBaseDir = '.strong-pm';
    } else {
      options.pmBaseDir = '.';
    }
  }
  options.pmBaseDir = path.resolve(options.cwd, options.pmBaseDir);

  options.execpath = process.execPath;
  options.script = [
    require.resolve('../bin/sl-pm'),
    '--listen', options.pmPort,
    '--base', options.pmBaseDir,
    '--base-port', options.basePort,
    '--driver', options.driver,
  ].join(' ');

  return writeSeedEnvironment(options, callback);
}

function writeSeedEnvironment(options, callback) {
  options.pmEnv = options.pmEnv || '';
  debug('extracting from: %j', options.pmEnv);
  options.pmEnv
    .split(/\s+/)
    .map(trim)
    .forEach(function(pair) {
      var kv = pair.split('=', 2);
      options.pmSeedEnv[kv[0]] = kv[1];
    });

  if (Object.keys(options.pmSeedEnv).length > 0) {
    options.pmEnvFile = path.resolve(options.pmBaseDir, 'env.json');
    return writeEnv(options.pmSeedEnv, options.pmEnvFile, callback);
  }

  return setImmediate(callback);

  function trim(s) {
    return s.trim();
  }

  function writeEnv(env, path, cb) {
    debug('setting seed env: %j', env);
    var store = new Environment(path);
    for (var k in env) {
      store.set(k, env[k]);
    }
    if (options.dryRun) {
      console.log('Would seed environment with: %j', env);
      return cb();
    } else {
      options._touched.push(path);
      store.save(cb);
    }
  }
}
