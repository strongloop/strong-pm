var assert = require('assert');
var childctl = require('strong-control-channel/process');
var cp = require('child_process');
var debug = require('debug')('strong-pm:test');
var fs = require('fs');
var helper = require('./helper');
var path = require('path');
var util = require('util');

require('shelljs/global');

process.env.cluster_size = 0;

console.log('Done setup, run process manager');

function onReceive() {
}

helper.manager = function manager(callback) {
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

  ctl.request({cmd: 'status'}, function (res) {
    var port = res.port;
    console.log('Listening port: %s', port);

    if (process.env.STRONGLOOP_PM) {
      process.env.STRONGLOOP_PM = 'http://localhost:' + port;
    }

    callback(port);
  });

  return pm;
};

helper.pmctl = {};

// Wait on cmd to write specific output
helper.pmctl.waiton = waiton;
function waiton(cmd, output) {
  while (true) {
    try {
      expect(cmd, output);
      return;
    } catch(er) {
      pause();
    }
  }
}

// Expect cmd to succeed and write specific output
helper.pmctl.expect = expect;
function expect(cmd, output) {
  var out = pmctl(cmd);
  console.log("%s code: %j output: <\n%s>", cmd, out.code, out.output);

  assert.equal(out.code, 0);
  checkOutput(out, output);
}

// Expect cmd to fail and write specific output
helper.pmctl.failon = failon;
function failon(cmd, output) {
  var out = pmctl(cmd);

  assert.notEqual(out.code, 0);
}

function checkOutput(out, output) {
  if (output) {
    if (typeof output === 'string')
      output = RegExp(output);
    //console.log('Test <%s> against %s', out.output, output);
    assert(output.test(out.output), out.output);
  }
}

helper.pmctl.run = pmctl;
function pmctl(/* cmd, arguments...*/) {
  var cli = require.resolve('../bin/sl-pmctl.js');
  var cmd = cli + ' ' + util.format.apply(util, arguments);
  var out = exec(cmd, {silent: true});
  out.output = out.output.trim();
  console.log('Run: %s => %s <%s>', cmd, out.code, out.output.replace(/\n/g,'$\n'));
  return out;
}

helper.pause = pause;
function pause(secs) {
  var secs = secs || 1;
  var start = process.hrtime();
  while (true) {
    var ts = process.hrtime(start);
    if (ts[0] >= secs)
      return;
  }
}

var pm = helper.manager(function(port) {
  var pmurl = util.format('http://127.0.0.1:%d/default', port);
  console.log('pmurl: %s', pmurl);

  var out = exec(util.format('git push %s master:master', pmurl));
  console.log('out:', out.code, out.code !== 0 ? out.output : '');
  assert.equal(out.code, 0);

  test(port);
});

function test(port) {
  console.log('Begin test:');
  waiton('status', /current:$/m);
  expect('--version', require('../package.json').version);
  expect('-v', require('../package.json').version);
  expect('--help', 'usage: ');
  expect('-h', 'usage: ');
  expect('', util.format('pid: *%d', pm.pid));
  expect('ls', /test-app@/);
  expect('ls', /buffertools@/);
  expect('status', util.format('port: *%d', port));
  failon('start', 'running, so cannot be started');
  expect('stop', 'stopped with status SIGTERM');
  waiton('status', /status: *stopped/);
  failon('stop', 'not running, so cannot be stopped');
  expect('start', 'starting');
  waiton('status', /status: *started/);
  expect('restart', 'stopped with status SIGTERM, restarting');
  waiton('status', /status: *started/);
  waiton('status', /worker count: *0/);
  expect('set-size 3');
  waiton('status', /worker count: *3/);
  expect('soft-restart', 'stopped with status 0, restarting');
  waiton('status', /worker count: *0/);

  expect('set-size 1');
  waiton('status', /worker count: *1/);
  if (require('semver').gt(process.version, '0.11.0')) {
    expect('cpu-start 0', /Profiler started/);
  } else {
    failon('cpu-start 0', /CPU profiler unavailable/);
  }

  if (process.env.STRONGLOOP_LICENSE) {
    expect('objects-start 1');
    expect('objects-stop 1');
  } else {
    console.error('SKIP objects-start/stop, no license');
  }

  expect('heap-snapshot 1 _heap');
  assert.doesNotThrow(
    function() {
      fs.statSync('_heap.heapsnapshot')
    },
    '_heap.heapsnapshot should exist'
  );

  expect('shutdown');

  pm.on('exit', done);
}

function done(code) {
  assert.equal(code, 0);
  helper.ok = true;
}
