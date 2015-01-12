process.env.STRONGLOOP_CLUSTER = 1;

var app = require('./helper');
var assert = require('assert');
var async = require('async');
var exec = require('child_process').exec;
var path = require('path');
var util = require('util');

var server = app.listen();
var cpuProfilingSupported = require('semver').gt(process.version, '0.11.0');

var REPO = 'some-repo-name';

function pmctl(/* cmd, arguments..., callback*/) {
  var cli = require.resolve('../bin/sl-pmctl.js');
  var args = Array.prototype.slice.call(arguments);
  var callback = args.pop();

  var cmd = cli + ' ' + util.format.apply(util, args);
  var out = exec(cmd, function(error, stdout, stderr) {
    output = stdout.trim() + stderr.trim();
    console.log('Run: %s => %s ', cmd, output.replace(/\n/g, '$\n'));
    setImmediate(callback);
  });
}

server.on('listening', function() {
  app.push(REPO);
});

var ServiceProcess = server._app.models.ServiceProcess;
var ServiceInstance = server._app.models.ServiceInstance;

function testInitialInstState(cb) {
  ServiceInstance.findOne(function(err, instance) {
    assert.ifError(err);
    assert(instance.agentVersion, 'Agent version should be set');
    assert.equal(instance.applicationName, 'test-app');
    assert(instance.containerVersionInfo, 'Container info should be set');
    assert(instance.npmModules, 'NPM modules should be set');
    assert.equal(instance.restartCount, 0);
    assert.equal(instance.setSize, 1);
    assert(instance.startTime, 'Start time should be set');
    assert.equal(instance.started, true);
    cb(err);
  });
}

function testInstanceState(expected, cb) {
  ServiceInstance.findOne(function(err, instance) {
    assert.ifError(err);
    assert.equal(instance.started, expected);
    cb(err);
  });
}

function testInitialWorkerState(cb) {
  ServiceProcess.findOne({where: { workerId: 1 }}, function(err, proc) {
    assert.ifError(err);
    assert.equal(proc.isProfiling, false);
    assert.equal(proc.isSnapshotting, false);
    assert.equal(proc.isTrackingObjects, false);
    assert(proc.startTime, 'Start time should be set');
    assert(!proc.stopTime, 'Stop time should not be set');
    assert(!proc.stopReason, 'Stop reason should not be set');
    cb(err);
  });
}

function testCpuStart(cb) {
  if (!cpuProfilingSupported) return cb();

  ServiceProcess.findOne({where: { workerId: 1 }}, function(err, proc) {
    assert.ifError(err);
    assert.equal(proc.isProfiling, true);
    cb(err);
  });
}

function testCpuStop(cb) {
  if (!cpuProfilingSupported) return cb();

  ServiceProcess.findOne({where: { workerId: 1 }}, function(err, proc) {
    assert.ifError(err);
    assert.equal(proc.isProfiling, false);
    cb(err);
  });
}

function testCpuWatchdogStart(cb) {
  if (!cpuProfilingSupported) return cb();

  ServiceProcess.findOne({where: { workerId: 1 }}, function(err, proc) {
    assert.ifError(err);
    assert.equal(proc.isProfiling, true);
    assert.equal(proc.watchdogTimeout, 1000);
    cb(err);
  });
}

function testObjTrackingStart(cb) {
  ServiceProcess.findOne({where: { workerId: 1 }}, function(err, proc) {
    assert.ifError(err);
    assert.equal(proc.isTrackingObjects, true);
    cb(err);
  });
}

function testObjTrackingStop(cb) {
  ServiceProcess.findOne({where: { workerId: 1 }}, function(err, proc) {
    assert.ifError(err);
    assert.equal(proc.isTrackingObjects, false);
    cb(err);
  });
}

function testWorkerExitState(cb) {
  server.once('exit', function() {
    ServiceProcess.findOne({where: { workerId: 1}}, function(err, proc) {
      assert.ifError(err);
      assert.equal(proc.isProfiling, false);
      assert.equal(proc.isSnapshotting, false);
      assert.equal(proc.isTrackingObjects, false);
      assert(proc.startTime, 'Start time should be set');
      assert(proc.stopTime, 'Stop time should be set');
      assert(proc.stopReason, 'Stop reason should be set');
      cb(err);
    });
  });
  pmctl('set-size 0', function(){});
}

function killClusterMaster(cb) {
  ServiceProcess.findOne({where: { workerId: 0}}, function(err, proc) {
    server.once('running', function() {
      cb();
    });
    process.kill(proc.pid, 'SIGTERM');
  });
}

function testRestartedInstState(cb) {
  ServiceInstance.findOne(function(err, instance) {
    assert.ifError(err);
    assert.equal(instance.restartCount, 1);
    cb(err);
  });
}

function testTotalWorkers(cb) {
  ServiceProcess.find(function(err, procs) {
    assert.ifError(err);
    assert.equal(procs.length, 4);
    cb(err);
  });
}

server.once('running', function() {
  var tests = [
    testInitialInstState,
    testInitialWorkerState,
    pmctl.bind(null, 'cpu-start 1'),
    testCpuStart,
    pmctl.bind(null, 'cpu-stop 1'),
    testCpuStop,
    pmctl.bind(null, 'objects-start 1'),
    testObjTrackingStart,
    pmctl.bind(null, 'objects-stop 1'),
    testObjTrackingStop,
    testWorkerExitState,
    killClusterMaster,
    testRestartedInstState,
    testTotalWorkers,
    testInstanceState.bind(null, true),
    pmctl.bind(null, 'stop'),
    testInstanceState.bind(null, false)
  ];

  if (process.platform === 'linux') {
    tests.push(pmctl.bind(null, 'start'),
      pmctl.bind(null, 'cpu-start 1 1000'),
      testCpuWatchdogStart,
      pmctl.bind(null, 'cpu-stop 1'),
      testCpuStop);
  }

  tests.push(server.stop.bind(server));
  async.series(tests, function(err) {
    assert.ifError(err);
    app.ok = 1;
  });
});
