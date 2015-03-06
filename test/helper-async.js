var assert = require('assert');
var async = require('async');
var childctl = require('strong-control-channel/process');
var cp = require('child_process');
var debug = require('debug')('strong-pm:test');
var defaults = require('lodash').defaults;
var rest = require('lodash').rest;
var fmt = require('util').format;
var fs = require('fs');
var mktmpdir = require('mktmpdir');
var partial = require('lodash').partial;
var once = require('lodash').once;
var path = require('path');
var rimraf = require('rimraf');

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
  var cd = path.resolve(__dirname, 'app');
  process.chdir(cd);

  return async.series([
    partial(rimraf, path.resolve(cd, '.git')),
    partial(rimraf, path.resolve(cd, '.strong-pm')),
    ex('git clean -f -d -x .'),
    ex('git init'),
    ex('git add .'),
    ex('git commit --author="sl-pm-test <nobody@strongloop.com>" -m initial'),
    ex('sl-build --install --commit'),
  ], function(err) {
    assert.ifError(err);
    console.log('test/app built succesfully')
    callback();
  });

  function ex(cmd) {
    console.log('exec `%s`', cmd);
    return function(cb) {
      cp.exec(cmd, {cwd: cd}, function(err, stdout, stderr) {
        if (err) {
          console.error(stdout);
          console.error(stderr);
          assert.ifError(err);
        }
        cb(err);
      });
    };
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
  if (env.STRONGLOOP_PM) {
    args.push('--no-control');
  }

  var pm;

  return mktmpdir(function(err, tmpdir, cleanup) {
    console.log('pmcli:', pmcli, args);
    cleanup = once(cleanup);

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
  reset(function() {
    pm(args, env, function(pm) {
      console.log('pmurl: %s', pm.pmurl);
      cp.exec(fmt('git push %s master:master', pm.pmurl), function(er) {
        assert.ifError(er, 'git push succeeds when auth not required');
        callback(pm);
      });
    });
  });
}

function queued(t) {
  var queue = [];
  var newT = {
    queue: queue,
    waiton: partial(addStep, queue, waiton, t),
    wait: partial(addStep, queue, wait, t),
    expect: partial(addStep, queue, expect, t),
    failon: partial(addStep, queue, failon, t),
    shutdown: partial(runTests, queue, t),
    test: subTest,
  };
  ['equal', 'notEqual', 'assert', 'end', 'skip', 'doesNotThrow'].forEach(function(m) {
    newT[m] = function() {
      t[m].apply(t, arguments);
    };
  });
  return newT;

  function subTest(name, opts, cb) {
    if (!cb && typeof opts === 'function') {
      cb = opts;
      opts = {};
    }
    queue.push(function(next) {
      t.test(name, function(subT) {
        var subQueued = queued(subT);
        subT.on('end', next);
        cb(subQueued);
        runTests(subQueued.queue, subT);
      });
    });
  }

  function runTests(queue, t, server) {
    console.log('# running queued tests... (%d)', queue.length);
    async.series(queue, function() {
      if (server) {
        server.on('exit', function(code, signal) {
          t.equal(signal, 'SIGTERM', 'pm server shutdown by us');
          t.end();
        });
        setTimeout(server.kill.bind(server, 'SIGTERM'), 2000);
      } else {
        t.end();
      }
    });
  }

  function addStep(queue, f, t, c, p) {
    var stack = Error().stack.split(/\n/);
    // keep first line, skip 3, keep rest, recombine
    stack = stack.slice(0, 1).concat(stack.slice(4)).join('\n');
    queue.push(partial(f, t, {stack: stack}, c, p));
  }
}

function expect(t, extra, cmd, pattern, next) {
  var name = fmt('pmctl %j =~ %s', cmd, new RegExp(pattern));
  console.log('# START expect %s', name);
  pmctl(cmd, function(out) {
    var match = checkOutput(out, pattern);
    extra = makeExtra(match, name, out.output, pattern, extra.stack);
    console.log('# expect %s against code: %j', name, out.code);

    t.equal(out.code, 0, name + ' exit code');

    if (out.code == 0) {
      t.assert(match, name, extra);
    }

    if (out.code != 0 || !match) {
      console.log('check failed against: <\n%>', out.output);
    }

    next();
  });
}

function waiton(t, extra, cmd, pattern, next) {
  var name = fmt('pmctl %j =~ %s', cmd, new RegExp(pattern));
  console.log('# START waiton %s', name);
  return check();

  function check() {
    pmctl(cmd, function(out) {
      console.log("# waiton %s against code: %j", name, out.code);
      if (out.code == 0 && checkOutput(out, pattern)) {
        t.assert(true, name);
        return next();
      }
      setTimeout(check, 1000);
    });
  }
}

function wait(t, extra, time, reason, next) {
  t.ok(true, fmt('%dms pause: %', time, reason));
  setTimeout(next, time);
}

function failon(t, extra, cmd, pattern, next) {
  var name = fmt('pmctl %j !~ %s', cmd, new RegExp(pattern));
  console.log('# START failon %s', name);
  pmctl(cmd, function(out) {
    console.log('# failon %s against code: %j', name, out.code);
    t.notEqual(out.code, 0, name);
    return next();
  });
}

function pmctl(cmd, callback) {
  var cli = require.resolve('../bin/sl-pmctl.js');
  var args = [cli].concat(cmd);
  var env = JSON.parse(JSON.stringify(process.env));
  env.STRONGLOOP_PM = '';
  return cp.execFile(process.execPath, args, {env: env}, function(er, stdout, stderr) {
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

function makeExtra(ok, name, actual, expected, stack) {
  var extra = {};
  if (!ok) {
    extra.error = Error();
    extra.error.name = 'Failed expectation';
    extra.error.stack = stack;
    extra.actual = actual;
    extra.expected = fmt('should match %s', expected);
    delete extra.error.code;
    delete extra.error.errno;
  }
  return extra;
}
