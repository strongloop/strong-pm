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

module.exports = exports = {
  pm: pm,
  pmWithApp: pmWithApp,
  queued: queued,
  reset: reset,
  pmctlWithCtl: pmctlWithCtl,
}

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

function pmWithApp(args, env, callback) {
  reset();
  pm(args, env, function(pm) {
    console.log('pmurl: %s', pm.pmurl);
    cp.exec(fmt('git push %s master:master', pm.pmurl), function(er) {
      assert.ifError(er, 'git push succeeds when auth not required');
      callback(pm);
    });
  });
}

function queued(t) {
  var queue = [];

  return {
    waiton: addStep.bind(null, queue, waiton, t),
    expect: addStep.bind(null, queue, expect, t),
    failon: addStep.bind(null, queue, failon, t),
    shutdown: runTests,
  }

  function runTests(server) {
    console.error('running queued tests...');
    async.series(queue, function() {
      server.on('exit', function(code, signal) {
        t.equal(signal, 'SIGTERM', 'pm server shutdown by us');
        t.end();
      })
      server.kill('SIGTERM');
    });
  }

  function addStep(queue, f, args) {
    args = [].slice.call(arguments).slice(2);
    queue.push(function(next) {
      f.apply(null, args.concat([next]));
    });
  }
}

function expect(t, cmd, pattern, next) {
  console.log('# START expect %j =~ %s', cmd, pattern);
  pmctl(cmd, function(out) {
    console.log('# expect %j with pattern %s against code: %j',
                cmd, pattern, out.code);

    t.equal(out.code, 0, 'pmctl exit code');

    if (out.code == 0) {
      t.assert(checkOutput(out, pattern), pattern || '(no pattern)');
    }

    if (out.code != 0 || !checkOutput(out, pattern)) {
      console.log('check failed against: <\n%>', out.output);
    }

    next();
  });
}

function waiton(t, cmd, pattern, next) {
  console.log('# START waiton %j =~ %s', cmd, pattern);
  return check();

  function check() {
    pmctl(cmd, function(out) {
      console.log("# waiton %j =~ %s against code: %j", cmd, pattern, out.code);
      if (out.code == 0 && checkOutput(out, pattern)) {
        t.equal(out.code, 0, 'pmctl exit code');
        t.assert(true, pattern || '(no pattern)');
        return next();
      }
      setTimeout(check, 1000);
    });
  }
}

function failon(t, cmd, pattern, next) {
  console.log('# START failon %j', cmd);
  pmctl(cmd, function(out) {
    console.log('# failon %j against code: %j', cmd, out.code);
    t.notEqual(out.code, 0);
    return next();
  });
}

function pmctl(cmd, callback) {
  var cli = require.resolve('../bin/sl-pmctl.js');
  var args = [cli].concat(cmd);
  return cp.execFile(process.execPath, args, {env: { STRONGLOOP_PM: '' }}, function(er, stdout, stderr) {
    var out = {
      out: stdout.trim(),
      err: stderr.trim(),
      output: stdout + '\n' + stderr,
      code: er ? er.code : 0
    };
    debug('Run: %s => %s out <\n%s>\nerr <\n%s>',
    cmd, out.code, out.out, out.err);
    return callback(out);
  });
}

function checkOutput(out, pattern) {
  // undefined and '' become /(?:)/
  // RegExp's become themselves
  return new RegExp(pattern).test(out.output);
}

function pmctlWithCtl(ctlPath) {
  return function pmctl(args) {
    args = [].slice.call(arguments);
    return ['--control', ctlPath].concat(args);
  }
}
