var assert = require('assert');
var async = require('async');
var childctl = require('strong-control-channel/process');
var cp = require('child_process');
var debug = require('debug')('strong-pm:test');
var defaults = require('lodash').defaults;
var fmt = require('util').format;
var mktmpdir = require('mktmpdir');
var path = require('path');

require('shelljs/global');

exports.reset = reset;
exports.pm = pm;

function reset(callback) {
  console.log('working dir for %s is %s', process.argv[1], process.cwd());

  // Enter test sandbox app
  cd(path.resolve(__dirname, 'app'));

  // Make sure we're working in our sandbox
  assert.equal(package().name, 'test-app', 'cwd is test-app');

  rm('-rf', '../receive-base');
  rm('-rf', '.git', '.strong-pm');
  ex('git clean -f -d -x .');
  assert(!test('-e', 'node_modules'));
  ex('git init');
  ex('git add .');
  ex('git commit --author="sl-pm-test <nobody@strongloop.com>" -m initial');
  ex('sl-build --install --commit');

  assert(!test('-e', 'node_modules/debug'), 'dev dep not installed');
  assert(test('-e', 'node_modules/buffertools'), 'prod dep installed');
  assert(!test('-e', 'node_modules/buffertools/build'), 'addons not built');
  assert(which('sl-build'), 'sl-build not in path');

  console.log('test/app built succesfully');

  if (callback) {
    setImmediate(callback);
  }

  function ex(cmd, async) {
    console.log('exec `%s`', cmd);
    return exec(cmd, async);
  }

  function package() {
    return require(path.resolve(pwd(),'package.json'));
  }
}

var pmcli = require.resolve('../bin/sl-pm.js');

function pm(args, env, callback) {
  args = args || [];
  env = env || {};

  if (typeof env === 'function' && !callback) {
    callback = env;
    env = {};
  }

  // Listened on zero to avoid port conflicts, search for actual port.
  args.push('--listen=0');
  if (process.env.STRONGLOOP_PM || env.STRONGLOOP_PM) {
    args.push('--no-control');
  }

  var pm;

  return mktmpdir(function(err, tmpdir, cleanup) {
    console.log('pmcli:', pmcli, args);

    pm = cp.spawn(pmcli, args, {
      stdio: ['ignore', process.stdout, process.stderr, 'ipc'],
      env: defaults(env, process.env),
      cwd: tmpdir,
    });
    pm.cwd = tmpdir;
    pm.env = env;

    pm.on('error', function(er) {
      cleanup();
      assert.ifError(er);
    });
    pm.on('exit', function() {
      cleanup();
    });

    if (callback) {
      pm.on('listening', callback);
    }

    // Used by PM to signal its controller that it is listening
    pm.ctl = childctl.attach(onReceive, pm);
  });

  return;

  function onReceive(req, cb) {
    if (req.cmd && req.cmd === 'listening') {
      console.log('Listening port: %s', req.port);
      pm.port = req.port;
      syncEnv(pm);
      pm.emit('listening', pm);
    }
    return cb();
  }

  function syncEnv(pm) {
    var auth = pm.env.TEST_STRONGLOOP_PM_HTTP_AUTH || '';
    auth += auth.length > 0 ? '@' : '';
    pm.pmurl = fmt('http://%s127.0.0.1:%d/default', auth, pm.port);
    pm.pmurlNoAuth = fmt('http://127.0.0.1:%d/default', pm.port);
    pm.pmctlUrl = fmt('http://%s127.0.0.1:%d/api', auth, pm.port);
    pm.pmctlUrlNoAuth = fmt('http://127.0.0.1:%d/api', pm.port);
    pm.pmctlPath = path.resolve(pm.cwd, 'pmctl');
    if (env.STRONGLOOP_PM) {
      pm.env.STRONGLOOP_PM = pm.pmurl;
      pm.env.STRONGLOOP_PM_NOAUTH = pm.pmurlNoAuth;
    }
  }
}
