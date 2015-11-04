var assert = require('assert');
var async = require('async');
var childctl = require('strong-control-channel/process');
var cp = require('child_process');
var debug = require('debug')('strong-pm:test');
var defaults = require('lodash').defaults;
var fmt = require('util').format;
var mktmpdir = require('mktmpdir');
var partial = require('lodash').partial;
var once = require('lodash').once;
var path = require('path');
var rimraf = require('rimraf');
var slBuild = require.resolve('strong-build/bin/sl-build');
var slDeploy = require.resolve('strong-deploy/bin/sl-deploy');

module.exports = exports = {
  pm: pm,
  pmWithApp: pmWithApp,
  queued: queued,
  reset: reset,
  pmctlWithCtl: pmctlWithCtl,
};

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
    ex('node "' + slBuild + '" --install --commit'),
  ], function(err) {
    assert.ifError(err);
    console.log('test/app built succesfully');
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

  // Avoid the ~/.strong-pm default, we want test artifacts to not be shared,
  // but for any user-provided --base argument to override this one.
  args.unshift('--base=.strong-pm');

  if (typeof env === 'function' && !callback) {
    callback = env;
    env = {};
  }

  // Listen on zero to avoid port conflicts, search for actual port.
  args.push('--listen=0');

  var pm;

  return mktmpdir(function(err, tmpdir, cleanup) {
    assert.ifError(err);
    console.log('pmcli:', pmcli, args);
    cleanup = once(cleanup);

    pm = cp.fork(pmcli, args, {
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
    pm.pmurl = fmt('http://%s127.0.0.1:%d', auth, pm.port);
    pm.pmurlNoAuth = fmt('http://127.0.0.1:%d', pm.port);
    pm.pmctlUrl = fmt('http://%s127.0.0.1:%d/api', auth, pm.port);
    pm.pmctlUrlNoAuth = fmt('http://127.0.0.1:%d/api', pm.port);
    pm.pmctlPath = path.resolve(pm.cwd, 'pmctl');
    pm.env.STRONGLOOP_PM = pm.pmurl;
    pm.env.STRONGLOOP_PM_NOAUTH = pm.pmurlNoAuth;

    // So pmctl, with no further config, can connect to an ephemeral pm port.
    process.env.STRONGLOOP_PM = pm.pmurl;
  }
}

function pmWithApp(args, env, callback) {
  if (typeof env === 'function') {
    callback = env;
    env = {};
  }
  assert.equal(typeof callback, 'function');
  reset(function() {
    pm(args, env, function(pm) {
      console.log('pmurl: %s', pm.pmurl);
      cp.exec(fmt('node "%s" %s master', slDeploy, pm.pmurl), function(er) {
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
  ['equal', 'notEqual', 'assert', 'end', 'doesNotThrow'].forEach(function(m) {
    newT[m] = function() {
      t[m].apply(t, arguments);
    };
  });

  // Each waiton() adds a listener... so we pass the limit of 10.
  t.setMaxListeners(50);

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
          debug('server exit: code %j signal %j', code, signal);
          t.notEqual(code, 0, 'pm server shutdown by us');
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

function testname(cmd, pattern) {
  if (cmd[0] === '--control')
    cmd = cmd.slice(2);
  cmd = cmd.join(' ');
  return fmt('cmd %j pattern %s', cmd, new RegExp(pattern));
}

function expect(t, extra, cmd, pattern, next) {
  var name = testname(cmd, pattern);
  console.log('\n# START expect %s', name);
  pmctl(cmd, function(out) {
    var match = checkOutput(out, pattern);
    extra = makeExtra(match, name, out.output, pattern, extra.stack);

    t.equal(out.code, 0, 'exit status should be zero for: ' + name);

    if (out.code === 0) {
      t.assert(match, name, extra);
    }

    if (out.code !== 0 || !match) {
      console.log('# FAIL expect %s against code: %j <\n%s>',
                  name, out.code, out.output);
    } else {
      console.log('# OK expect %s', name);
    }

    next();
  });
}

function waiton(t, extra, cmd, pattern, next) {
  var name = testname(cmd, pattern);
  console.log('\n# START waiton %s', name);
  var running = true;
  t.once('end', function() {
    running = false;
  });
  return check();

  function check() {
    pmctl(cmd, function(out) {
      if (out.code === 0 && checkOutput(out, pattern)) {
        console.log('# OK waiton %s', name);
        t.assert(true, name);
        return next();
      }
      if (running)
        setTimeout(check, 1000);
    });
  }
}

function wait(t, extra, time, reason, next) {
  t.ok(true, fmt('%dms pause: %', time, reason));
  setTimeout(next, time);
}

function failon(t, extra, cmd, pattern, next) {
  var name = testname(cmd, pattern);
  console.log('\n# START failon %s', name);
  pmctl(cmd, function(out) {
    var match = checkOutput(out, pattern);
    extra = makeExtra(match, name, out.output, pattern, extra.stack);
    console.log('# failon %s against code: %j', name, out.code);

    t.notEqual(out.code, 0, 'exit status should not be zero for: ' + name);

    if (out.code !== 0) {
      t.assert(match, name, extra);
    }

    if (out.code === 0 || !match) {
      console.log('check failed against code %d <\n%s>', out.code, out.output);
    }

    return next();
  });
}

function pmctl(cmd, callback) {
  var cli = require.resolve('../bin/sl-pmctl.js');
  var args = [cli].concat(cmd);
  var env = JSON.parse(JSON.stringify(process.env));
  return cp.execFile(process.execPath, args, {env: env}, cb);
  function cb(er, stdout, stderr) {
    var out = {
      out: stdout.trim(),
      err: stderr.trim(),
      output: stdout + '\n' + stderr,
      code: er ? er.code : 0,
    };
    debug('Run: %s => %s out <\n%s>\nerr <\n%s>',
          cmd, out.code, stdout, stderr);
    return callback(out);
  }
}

function checkOutput(out, pattern) {
  // undefined and '' become /(?:)/
  // RegExp's become themselves
  var match = new RegExp(pattern).test(out.output);
  // debug('pattern match: %j', match);
  // debug('out <\n%s>', out.output);
  return match;
}

function pmctlWithCtl(control) {
  return function pmctl(args) {
    control = control || process.env.STRONGLOOP_PM;
    args = [].slice.call(arguments);
    return ['--control', control].concat(args);
  };
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
