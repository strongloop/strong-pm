var assert = require('assert');
var childctl = require('strong-control-channel/process');
var cp = require('child_process');
var debug = require('debug')('strong-pm:test');
var fs = require('fs');
var path = require('path');
var tap = require('tap');
var util = require('util');

var pm;
var port;

function setup(t) {
  var helper = require('./helper');
  delete helper.ok; // Use tap to determine ok

  process.env.STRONGLOOP_CLUSTER = 0;

  t.test('setup', {timeout: 10000}, function(t) {
    if (port) {
      t.assert(true, 'reuse pm setup');
      return t.end();
    }
    _pm = manager(function(_port) {
      var auth = process.env.TEST_STRONGLOOP_PM_HTTP_AUTH || '';
      auth += auth.length > 0 ? '@' : '';
      var pmurl = util.format('http://%s127.0.0.1:%d/default', auth, _port);
      console.log('pmurl: %s', pmurl);

      cp.exec(util.format('git push %s master:master', pmurl), function(er) {
        assert.ifError(er);
        port = _port;
        pm = _pm;
        t.assert(true, 'pm started on port ' + _port);
        t.end();
      });
    });
  });

  waiton(t, 'status', /current:$/m);
}

function expect(t, cmd, pattern) {
  var name = 'expect: ' + cmd + ' ' + (pattern || '');
  t.test(name, function(t) {
    console.log("START %s", name);
    pmctl(cmd, function(out) {
      console.log("check %s with pattern %j against code: %j",
        name, pattern, out.code);

      t.equal(out.code, 0, 'pmctl exit code');

      if (out.code == 0)
        t.assert(checkOutput(out, pattern), pattern || '(no pattern)');

      if (out.code != 0 || !checkOutput(out, pattern))
        console.log('check failed against: <\n%>', out.output);
      t.end();
    });
  });
}

function waiton(t, cmd, pattern) {
  var name = 'waiton: ' + cmd + ' ' + (pattern || '');
  t.test(name, {timeout: 10000}, function(t) {
    console.log("START %s", name);
    check();

    function check() {
      pmctl(cmd, function(out) {
        console.log("check %s against code: %j", name, out.code);
        if (out.code == 0 && checkOutput(out, pattern)) {
          t.equal(out.code, 0, 'pmctl exit code');
          t.assert(true, pattern || '(no pattern)');
          t.end();
          return;
        }
        setTimeout(check, 1000);
      });
    }
  });
}

function failon(t, cmd, pattern) {
  var name = 'failon: ' + cmd + ' ' + (pattern || '');
  t.test(name, function(t) {
    console.log("START %s", name);
    pmctl(cmd, function(out) {
      console.log("check %s against code: %j", name, out.code);

      t.notEqual(out.code, 0);
      // FIXME(sam) output assertions were missing from the original, I'll
      // add them back in once I know the original test passes, because
      // the patterns may not be correct
      // t.assert(checkOutput(out, pattern), pattern || '(no pattern)');
      t.end();
    });
  });
}

function pmctl(cmd, callback) {
  var cli = require.resolve('../bin/sl-pmctl.js');
  cmd = process.execPath + ' ' + cli + ' ' + cmd;
  return cp.exec(cmd, function(er, stdout, stderr) {
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
  if (!pattern)
    return true;

  if (typeof pattern === 'string')
    pattern = RegExp(pattern);
  if (pattern.test(out.output))
    return true;
  return false;
}

function manager(callback) {
  var pmcli = require.resolve('../bin/sl-pm.js');

  // Listened on zero to avoid port conflicts, search for actual port.
  var args = [
    '--listen=0',
  ];
  if (process.env.STRONGLOOP_PM) {
    args.push('--no-control');
  }
  console.log('pmcli:', pmcli, args);
  var pm = cp.spawn(pmcli, args, {
    stdio: ['ignore', process.stdout, process.stderr, 'ipc'],
  });
  pm.on('error', function(er) {
    assert.ifError(er);
  });

  var ctl = childctl.attach(onReceive, pm);

  function onReceive() {
  }

  ctl.request({cmd: 'status'}, function (res) {
    var port = res.port;
    console.log('Listening port: %s', port);

    if (process.env.STRONGLOOP_PM) {
      var auth = process.env.TEST_STRONGLOOP_PM_HTTP_AUTH || '';
      auth += auth.length > 0 ? '@' : '';
      process.env.STRONGLOOP_PM = util.format('http://%s127.0.0.1:%d/',
                                              auth, port);
    }

    callback(port);
  });

  return pm;
};

function test(name, callback) {
  // XXX could skip tests here, based on presence of TAP_ONLY
  tap.test(name, function(t) {
    console.log('TEST:', name);
    // XXX could set t globally here, so it doesn't have to be an explicit
    // param of expect/failon/waiton
    setup(t);
    callback(t);
  });
}

test('start', function(t) {
  // Check the setup() routine starts pm
});

test('start (again)', function(t) {
  // Check the setup() routine short-circuits, because pm is started
});

test('version', function(t) {
  expect(t, '--version', require('../package.json').version);
  expect(t, '-v', require('../package.json').version);
});

test('help', function(t) {
  expect(t, '--help', 'usage: ');
  expect(t, '-h', 'usage: ');
});

test('status has pm pid', function(t) {
  // empty command is synonymous with 'status'
  expect(t, '', util.format('pid: *%d', pm.pid));
});

test('ls', function(t) {
  expect(t, 'ls', /test-app@/);
  expect(t, 'ls', /buffertools@/);
});

test('status, start, stop, etc.', function(t) {
  expect(t, 'set-size 0');
  waiton(t, 'status', /worker count: *0/);

  expect(t, 'status', util.format('port: *%d', port));
  failon(t, 'start', 'running, so cannot be started');
  expect(t, 'stop', 'stopped with status SIGTERM');
  waiton(t, 'status', /status: *stopped/);
  failon(t, 'stop', 'not running, so cannot be stopped');
  expect(t, 'start', 'starting');
  waiton(t, 'status', /status: *started/);
  expect(t, 'restart', 'stopped with status SIGTERM, restarting');
  waiton(t, 'status', /status: *started/);
  waiton(t, 'status', /worker count: *0/);
  expect(t, 'set-size 3');
  waiton(t, 'status', /worker count: *3/);
  expect(t, 'soft-restart', 'stopped with status 0, restarting');
  waiton(t, 'status', /worker count: *0/);

  expect(t, 'set-size 1');
  waiton(t, 'status', /worker count: *1/);

  waiton(t, 'restart', 'stopped with status SIGTERM, restarting');
  waiton(t, 'status', /worker count: *0/);
});

test('env get, set, unset', function(t) {
  expect(t, 'set-size 1');
  waiton(t, 'status', /worker count: *1/);

  expect(t, 'env-get', 'No matching environment variables defined');
  expect(t, 'env-get NOTSET', 'No matching environment variables defined');

  expect(t, 'env-set FOO=bar BAR=foo', 'Environment updated');
  expect(t, 'env-get', /FOO=bar/);
  expect(t, 'env-get', /BAR=foo/);
  expect(t, 'env-get FOO', /FOO=bar/);
  expect(t, 'env-get NOTSET', 'No matching environment variables defined');

  expect(t, 'env-unset FOO', 'Environment updated');
  expect(t, 'env-get', /BAR=foo/);
  expect(t, 'env-get FOO', 'No matching environment variables defined');
});


test('cpu start, stop', function(t) {
  expect(t, 'set-size 1');
  waiton(t, 'status', /worker count: *1/);

  expect(t, 'cpu-start 0', /Profiler started/);
  expect(t, 'cpu-stop 0', /CPU profile written.*node.0.cpuprofile/);

  if (process.platform === 'linux') {
    expect(t, 'cpu-start 0 100', /Profiler started/);
    expect(t, 'cpu-stop 0', /CPU profile written.*node.0.cpuprofile/);
  } else {
    failon(t, 'cpu-start 0 100', /Profiler started/);
    failon(t, 'cpu-stop 0', /Profiler stopped/);
  }
});

test('objects start, stop', function(t) {
  if (process.env.STRONGLOOP_LICENSE) {
    expect(t, 'set-size 1');
    waiton(t, 'status', /worker count: *1/);
    expect(t, 'objects-start 1');
    expect(t, 'objects-stop 1');
  } else {
    t.skip('objects-start/stop, no license');
    t.end();
  }
});

test('heap snapshot', function(t) {
  expect(t, 'set-size 1');
  waiton(t, 'status', /worker count: *1/);

  expect(t, 'heap-snapshot 1 _heap');
  t.test(function(t) {
    t.doesNotThrow(
      function() {
        fs.statSync('_heap.heapsnapshot')
      },
      '_heap.heapsnapshot should exist'
    );
    t.end();
  });
});

tap.test('shutdown', {timeout: 5000}, function(t) {
  pm.on('exit', function(code, signal) {
    console.log('shutdown caused exit:', signal || code);
    t.equal(code, 0);
    t.end();
  });
  expect(t, 'shutdown');
});
