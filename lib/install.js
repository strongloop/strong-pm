var async = require('async');
var child_process = require('child_process');
var debug = require('debug')('strong-pm:install');
var fs = require('fs');
var mkdirp = require('mkdirp');
var Parser = require('posix-getopt').BasicParser;
var passwd = require('passwd-user');
var path = require('path');
var slServiceInstall = require('strong-service-install');
var uidNumber = require('uid-number');

module.exports = install;

function printHelp($0, prn) {
  prn('usage: %s [options]', $0);
  prn('');
  prn('Options:');
  prn('  -h,--help           Print this message and exit.');
  prn('  -v,--version        Print version and exit.');
  prn('  -b,--base BASE      Base directory to work in (default .strong-deploy).');
  prn('  -c,--config CONFIG  Config file (default BASE/config).');
  prn('  -u,--user USER      User to run sl-pm as (default current user).');
  prn('  -p,--port PORT      Listen on PORT for git pushes (no default).');
  prn('  -n,--dry-run        Don\'t write any files.');
  prn('  -j,--job-file FILE  Path of Upstart job to create (default /etc/init/strong-pm.conf)');
  prn('  -f,--force          Overwrite existing job file if present');
  prn('  --upstart VERSION   Specify the version of Upstart to target (default: 1.4, 0.6 is supported)');
}

function install(argv, callback) {
  var $0 = process.env.CMD || path.basename(argv[1]);
  var parser = new Parser([
      ':v(version)',
      'h(help)',
      'b:(base)',
      'c:(config)',
      'u:(user)',
      'p:(port)',
      'j:(job-file)',
      'n(dry-run)',
      'f(force)',
      'i:(upstart)',
    ].join(''),
    argv);

  var base = '.strong-deploy';
  var config = 'config';
  var port = 0; // invalid by default
  var dryRun = false;
  var force = false;
  var user = 'strong-pm';
  var jobFile = '/etc/init/strong-pm.conf';
  var ignorePlatform = process.env.SL_PM_INSTALL_IGNORE_PLATFORM;
  var version = '1.4';

  while ((option = parser.getopt()) !== undefined) {
    switch (option.option) {
      case 'v':
        console.log(require('../package.json').version);
        return callback();
      case 'h':
        printHelp($0, console.log);
        return callback();
      case 'b':
        base = option.optarg;
        break;
      case 'c':
        config = option.optarg;
        break;
      case 'p':
        port = option.optarg | 0; // cast to an integer
        break;
      case 'u':
        user = option.optarg;
        break;
      case 'j':
        jobFile = option.optarg;
        break;
      case 'n':
        dryRun = true;
        break;
      case 'f':
        force = true;
        break;
      case 'i':
        version = option.optarg;
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

  if (port < 1) {
    console.error('Valid port was not specified, try `%s --help`.', $0);
    return callback(Error('usage'));
  }

  if (process.platform !== 'linux') {
    console.error('%s: only Upstart on Linux is supported',
                  ignorePlatform ? 'Warning' : 'Error');
    if (!ignorePlatform)
      return callback(Error('platform'));
  }

  if (version !== '0.6' && version !== '1.4') {
    console.error('Invalid usage (only upstart "0.6" and "1.4" supported)');
    return callback(Error('usage'));
  }

  var jobConfig = {
    user: user,
    pmBaseDir: base,
    pmPort: port,
    pmConfigFile: config,
    dryRun: dryRun,
    jobFile: jobFile,
    force: force,
    version: version,
  };

  var steps = [
    ensureUser, fillInGroup, fillInHome, ensureBaseDir,
    setCommand, slServiceInstall
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

function ensureBaseDir(options, cb) {
  if (options.dryRun) {
    console.log('would create', options.pmBaseDir);
    return setImmediate(cb);
  }
  mkdirp(options.pmBaseDir, {}, function(err, made) {
    if (err) {
      console.error('Error creating base directory %s: %s', made, err.message);
    }
    if (made) {
      uidNumber(options.user, options.group, function(err, uid, gid) {
        if (err) {
          console.error('Error getting numeric uid/gid of %s/%s: %s',
                        options.user, options.group, err.message);
          return cb(err);
        }
        fs.chown(made, uid, gid, function(err) {
          if (err)
            console.error('Error setting ownership of base directory %s: %s',
                          made, err.message);
          cb(err);
        });
      });
    }
    cb(err);
  });
}
