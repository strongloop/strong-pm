var async = require('async');
var child_process = require('child_process');
var debug = require('debug')('strong-pm:install');
var Environment = require('./env');
var fs = require('fs');
var mkdirp = require('mkdirp');
var Parser = require('posix-getopt').BasicParser;
var passwd = require('passwd-user');
var path = require('path');
var slServiceInstall = require('strong-service-install');
var uidNumber = require('uid-number');
var auth = require('./auth');

module.exports = install;

function printHelp($0, prn) {
  var usageFile = require.resolve('../bin/sl-pm-install.txt');
  var USAGE = fs.readFileSync(usageFile, 'utf-8')
                .replace(/%MAIN%/g, $0)
                .trim()
                ;
  prn(USAGE);
}

function install(argv, callback) {
  var $0 = process.env.CMD || path.basename(argv[1]);
  var parser = new Parser([
      ':v(version)',
      'h(help)',
      'b:(base)',
      'c:(config)',
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
    ].join(''),
    argv);

  var ignorePlatform = process.env.SL_PM_INSTALL_IGNORE_PLATFORM;

  var jobConfig = {
    user: 'strong-pm',
    pmBaseDir: '.strong-pm', // this should be options.cwd from fillInHome
    pmPort: 0, // invalid by default
    pmConfigFile: 'config',
    dryRun: false,
    jobFile: null, // strong-service-install provides an init-specific default
    force: false,
    upstart: false,
    systemd: false,
    env: {},
    pmEnv: '',
    pmSeedEnv: {},
  };

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
        break;
      case 'c':
        jobConfig.pmConfigFile = option.optarg;
        break;
      case 'e':
        jobConfig.pmEnv = option.optarg;
        break;
      case 'p':
        jobConfig.pmPort = option.optarg | 0; // cast to an integer
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
        jobConfig.env.STRONGLOOP_PM_HTTP_AUTH = auth.parse(option.optarg).normalized;
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

  if (jobConfig.pmPort < 1) {
    console.error('Valid port was not specified, try `%s --help`.', $0);
    return callback(Error('usage'));
  }

  if (process.platform !== 'linux') {
    console.error('%s: only Upstart on Linux is supported',
                  ignorePlatform ? 'Warning' : 'Error');
    if (!ignorePlatform)
      return callback(Error('platform'));
  }

  if (!jobConfig.systemd && !jobConfig.upstart) {
    jobConfig.upstart = '1.4'; // default
  } else if (jobConfig.systemd && jobConfig.upstart) {
    console.error('Invalid usage (cannot specify both --systemd and --upstart)' +
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
    console.error('Bad http-auth specification: %s', jobConfig.env.STRONGLOOP_PM_AUTH);
    return callback(Error('usage'));
  }

  var steps = [
    ensureUser, fillInGroup, fillInHome,
    setCommand, ensureBaseDir,
    prepareSeedEnvironment,
    writeSeedEnvironment,
    ensureOwner, slServiceInstall
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
      })
    }
  }
}

function ensureUser(options, callback) {
  userExists(options.user, function(err, exists) {
    if (err || exists)
      return callback(err);
    if (options.dryRun) {
      console.log('skipping user creation in dry-run');
      return callback();
    }
    if (process.platform != 'linux') {
      console.log('skipping user creation on non-Linux platform');
      return callback();
    }
    options.home = '/var/lib/' + options.user;
    useradd(options.user, options.home, callback);
  });
}

function useradd(name, home, callback) {
  var cmd = '/usr/sbin/useradd';
  var args = [
    '--home', home,
    '--shell', '/bin/false',
    '--skel', '/dev/null',
    '--create-home', '--user-group', '--system',
    name
  ];
  child_process.execFile(cmd, args, function(err, stdout, stderr) {
    if (err) {
      console.error('Error adding user %s:\n%s\n%s',
                    name, stdout, stderr);
    }
    callback(err);
  });
}

function userExists(name, callback) {
  var cmd = '/usr/bin/id';
  var args = [ name ];
  child_process.execFile(cmd, args, function(err) {
    callback(null, !err);
  });
}

function fillInGroup(options, callback) {
  var cmd = '/usr/bin/id';
  var args = ['-gn', options.user];
  child_process.execFile(cmd, args, function(err, stdout) {
    if (err) {
      console.error('Could not determine group for service user \'%s\': %s',
                    options.user, err.message);
    } else {
      options.group = stdout.trim();
    }
    callback(err);
  });
}

function fillInHome(options, callback) {
  return passwd(options.user, function(err, user) {
    if (err) {
      console.error('Could not determine $HOME of \'%s\':',
                    options.user, err.message);
    } else {
      options.env = options.env || {};
      options.env.HOME = user.homedir;
      options.cwd = user.homedir;
    }
    callback(err);
  });
}

function setCommand(options, callback) {
  options.name = 'strong-pm';
  options.pmBaseDir = path.resolve(options.cwd, options.pmBaseDir);
  options.pmConfigFile = path.resolve(options.pmBaseDir, options.pmConfigFile);
  options.command = [
    process.execPath,
    require.resolve('../bin/sl-pm'),
    '--listen', options.pmPort,
    '--base', options.pmBaseDir,
    '--config', options.pmConfigFile,
  ];
  // always async
  return setImmediate(callback);
}

function ensureBaseDir(options, callback) {
  if (options.dryRun) {
    console.log('would create', options.pmBaseDir);
    return setImmediate(callback);
  }
  mkdirp(options.pmBaseDir, {}, function(err, made) {
    if (err) {
      console.error('Error creating base directory %s: %s', made, err.message);
    }
    callback(err);
  });
}

function ensureOwner(options, callback) {
  if (options.dryRun) {
    console.log('Would chown ', options.pmBaseDir);
    return setImmediate(callback);
  }
  console.error('ensuring owner: ', options.pmBaseDir);
  uidNumber(options.user, options.group, function(err, uid, gid) {
    if (err) {
      console.error('Error getting numeric uid/gid of %s/%s: %s',
                    options.user, options.group, err.message);
      return callback(err);
    }
    subPaths(options.pmBaseDir, function(err, paths) {
      if (err) {
        return callback(err);
      } else {
        return async.each(paths, chown, callback);
      }

      function chown(path, next) {
        fs.chown(path, uid, gid, function(err) {
          if (err) {
            console.error('Error setting ownership of base directory %s: %s',
                          path, err.message);
          }
          next(err);
        });
      }
    });
  });

  function subPaths(dir, callback) {
    var cmd = '/usr/bin/find';
    var args = [ dir.replace(/\/+$/, '') ];
    child_process.execFile(cmd, args, function(err, stdout, stderr) {
      if (err) {
        console.error('Error walking path %s:\n%s\n%s',
                      dir, stdout, stderr);
      }
      var paths = stdout.split(/\n/)
                        // .map(function(p) {
                        //   return path.join(dir, p);
                        // });
                        .filter(function(p) {
                          return p.length > 0;
                        });
      callback(err, paths);
    });
  }
}

function prepareSeedEnvironment(options, callback) {
  options.pmEnv = options.pmEnv || '';
  debug('extracting from: %j', options.pmEnv);
  options.pmEnv
    .split(/\s+/)
    .map(trim)
    .forEach(function(pair) {
      var kv = pair.split('=', 2);
      options.pmSeedEnv[kv[0]] = kv[1];
    });

  return setImmediate(callback);

  function trim(s) {
    return s.trim();
  }
}

function writeSeedEnvironment(options, callback) {
  if (Object.keys(options.pmSeedEnv).length > 0) {
    var envPath = path.resolve(options.pmBaseDir, 'env.json');
    return writeEnv(options.pmSeedEnv, envPath, callback);
  } else {
    debug('no seed environment');
    return setImmediate(callback);
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
      store.save(cb);
    }
  }
}
