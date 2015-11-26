process.env.STRONGLOOP_CLUSTER = 1;
// Prevent the wsRouter from keeping node alive long enough to make tap
// timeout.
process.env.STRONGLOOP_CHANNEL_TIMEOUT = 1;

var app = require('./helper');
var exec = require('child_process').exec;
var tap = require('tap');
var util = require('util');

var server = app.listen();
var cpuProfilingSupported = require('semver').gt(process.version, '0.11.0');
var notLicensed = process.env.STRONGLOOP_LICENSE ? false : 'requires license';

var REPO = 'some-repo-name';
var CTL = 'http://127.0.0.1:8701';

function pmctl(/* arguments..., callback */) {
  var cli = require.resolve('../bin/sl-pmctl.js');
  var args = Array.prototype.slice.call(arguments);
  return doPmctl;
  function doPmctl(t, noEnd) {
    var cmd = cli + ' -C ' + CTL + ' ' + util.format.apply(util, args);
    exec(cmd, function(err, stdout) {
      console.log('# Run: %s => err: %j stdout <\n%s>', cmd, err, stdout);
      t.ifError(err);
      if (!noEnd) {
        t.end();
      }
    });
  }
}

server.on('listening', function(addr) {
  app.push(REPO);
  console.error(arguments);
  CTL = 'http://127.0.0.1:' + addr.port;
});

var ServiceProcess = server._meshApp.models.ServiceProcess;
var ServiceInstance = server._meshApp.models.ServiceInstance;

function testInitialInstState(t) {
  ServiceInstance.findOne(function(err, instance) {
    t.ifError(err);
    t.assert(instance.agentVersion, 'Agent version should be set');
    t.equal(instance.applicationName, 'test-app');
    t.assert(instance.containerVersionInfo, 'Container info should be set');
    t.equal(instance.restartCount, 0);
    t.equal(instance.setSize, 1);
    t.assert(instance.startTime, 'Start time should be set');
    t.equal(instance.started, true);
    t.end();
  });
}

function testInstanceState(expected) {
  return doTest;
  function doTest(t) {
    ServiceInstance.findOne(function(err, instance) {
      t.ifError(err);
      console.log('# testInstanceState: expected=%j:', expected, instance);
      t.equal(instance.started, expected);
      t.end();
    });
  }
}

function testInitialWorkerState(t) {
  ServiceProcess.findOne({where: {workerId: 1}}, function(err, proc) {
    t.ifError(err);
    t.equal(proc.isProfiling, false);
    t.equal(proc.isSnapshotting, false);
    t.equal(proc.isTrackingObjects, false);
    t.assert(proc.startTime, 'Start time should be set');
    t.assert(!proc.stopTime, 'Stop time should not be set');
    t.assert(!proc.stopReason, 'Stop reason should not be set');
    t.end();
  });
}

function testCpuStart(t) {
  ServiceProcess.findOne({where: {workerId: 1}}, function(err, proc) {
    t.ifError(err);
    t.assert(proc, 'worker 1 exists');
    t.equal(proc.isProfiling, true, 'worker 1 is profiling');
    t.end();
  });
}

function testCpuStop(t) {
  ServiceProcess.findOne({where: {workerId: 1, stopTime: null}},
    function(err, proc) {
      t.ifError(err);
      t.equal(proc.isProfiling, false);
      t.end();
    }
  );
}

function testCpuWatchdogStart(t) {
  ServiceProcess.findOne({where: {workerId: 1, stopTime: null}},
    function(err, proc) {
      t.ifError(err);
      t.equal(proc.isProfiling, true);
      t.equal(proc.watchdogTimeout, 1000);
      t.end();
    }
  );
}

function testObjTrackingStart(t) {
  ServiceProcess.findOne({where: {workerId: 1}}, function(err, proc) {
    t.ifError(err);
    t.equal(proc.isTrackingObjects, true);
    t.end();
  });
}

function testObjTrackingStop(t) {
  ServiceProcess.findOne({where: {workerId: 1}}, function(err, proc) {
    t.ifError(err);
    t.equal(proc.isTrackingObjects, false);
    t.end();
  });
}

function testWorkerExitState(t) {
  server.once('exit', function() {
    ServiceProcess.findOne({where: {workerId: 1}}, function(err, proc) {
      t.ifError(err);
      t.equal(proc.isProfiling, false);
      t.equal(proc.isSnapshotting, false);
      t.equal(proc.isTrackingObjects, false);
      t.assert(proc.startTime, 'Start time should be set');
      t.assert(proc.stopTime, 'Stop time should be set');
      t.assert(proc.stopReason, 'Stop reason should be set');
      t.end();
    });
  });
  pmctl('set-size 1 0')(t, true);
}

function killClusterMaster(t) {
  ServiceProcess.findOne({where: {workerId: 0}}, function(err, proc) {
    t.ifError(err);
    t.assert(proc);
    server.once('running', function() {
      t.pass('running');
      t.end();
    });
    process.kill(proc.pid, 'SIGTERM');
  });
}

function testRestartedInstState(t) {
  ServiceInstance.findOne(function(err, instance) {
    t.ifError(err);
    t.equal(instance.restartCount, 1);
    t.end();
  });
}

function testTotalWorkers(count) {
  return testCount;

  function testCount(t) {
    ServiceProcess.find(function(err, procs) {
      t.ifError(err);
      t.equal(procs.length, count);
      t.end();
    });
  }
}

function waitForWorkers(t) {
  waitForWorkers.count = waitForWorkers.count || 0;
  waitForWorkers.count += 1;
  ServiceProcess.find(function(err, procs) {
    console.log('# checked %d times on wait for worker', waitForWorkers.count);
    // supervisor + workers
    if (procs.length > 1) {
      return t.end();
    } else if (waitForWorkers.count > 20) {
      t.ifError(err);
      t.fail('no workers');
      return t.end();
    } else {
      return setTimeout(waitForWorkers.bind(null, t), 100);
    }
  });
}

tap.test('running', function(t) {
  server.once('running', function() {
    t.pass('running');
    t.end();
  });
});

tap.test('initial state', testInitialInstState);
tap.test('worker state', testInitialWorkerState);
tap.test('set-size 1 1', pmctl('set-size 1 1'));
tap.test('status 1', pmctl('status 1'));
tap.test('wait for workers', waitForWorkers);
tap.test('status 1', pmctl('status 1'));
tap.test('cpu-start 1.1.1', pmctl('cpu-start 1.1.1'));
tap.test('verify cpu-start', {skip: !cpuProfilingSupported}, testCpuStart);
tap.test('cpu-stop 1.1.1', pmctl('cpu-stop 1.1.1'));
tap.test('verify cpu-stop', {skip: !cpuProfilingSupported}, testCpuStop);
tap.test('objects-start 1.1.1', {skip: notLicensed},
         pmctl('objects-start 1.1.1'));
tap.test('verify objects-start', {skip: notLicensed}, testObjTrackingStart);
tap.test('objects-stop 1.1.1', {skip: notLicensed},
         pmctl('objects-stop 1.1.1'));
tap.test('verify objects-stop', {skip: notLicensed}, testObjTrackingStop);
tap.test('worker exit state', testWorkerExitState);
tap.test('kill cluster master', killClusterMaster);
tap.test('verify restart state', testRestartedInstState);
tap.test('wait for workers', waitForWorkers);
tap.test('verify worker count',
         {skip: 'behaviour seems to depend on strong-mesh-models version'},
         testTotalWorkers(4)); // master + worker * 2
tap.test('verify instnace state started=true', testInstanceState(true));
tap.test('stop 1', pmctl('stop 1'));
tap.test('status 1', pmctl('status 1'));
tap.test('status 1', pmctl('status 1'));
tap.test('status 1', pmctl('status 1'));
tap.test('verify instance state started=false',
         {todo: 'has never been started? or administratively down?'},
         testInstanceState(false));

// TODO: re-enable or move
if (process.platform === 'XXX' + 'linux') {
  tap.test(pmctl('start 1'));
  tap.test(pmctl('cpu-start 1.1.1 1000'));
  tap.test(testCpuWatchdogStart);
  tap.test(pmctl('cpu-stop 1.1.1'));
  tap.test(testCpuStop);
}

tap.test('shutdown', function(t) {
  server.stop(function(err) {
    t.ifError(err);
    app.ok = 1;
    t.end();
  });
});
