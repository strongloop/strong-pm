var Server = require('../lib/server');
var assert = require('assert');
var async = require('async');
var debug = require('debug')('strong-pm:test');
var path = require('path');
var tap = require('tap');
var events = require('events');
var util = require('util');

var BASE = path.resolve(__dirname, '.strong-pm');

function MockDriver() {
};

function MockCurrent() {
  this.child = {
    pid: 59312
  };
}
util.inherits(MockCurrent, events.EventEmitter);

MockCurrent.prototype.request = function request(req, cb) {
  if (req.cmd === 'status') {
    cb({ master: { setSize: 1 } });
  }
  if (req.cmd === 'npm-ls') {
    cb({});
  }
}

tap.test('full server construction', function(t) {
  var s = new Server({
    cmdName: 'pm',
    baseDir: '_base',
    listenPort: 0,
    controlPath: null,
  });
  t.end();
});

tap.test('mocked server construction', function(t) {
  var serviceManager = {};
  var options = {
    cmdName: 'pm',
    baseDir: '_base',
    listenPort: 0,
    controlPath: null,
    // Environment: XXX(sam) don't bother, this is about to be rewritten
    Driver: function(o) {
      driver = o;
      return {on: function(event) { t.equal(event, 'request'); }};
    },
    ServiceManager: function(o) {
      serviceManagerOptions = o;
      return serviceManager;
    },
    MeshServer: function(_serviceManager, o) {
      t.equal(_serviceManager, serviceManager);
      t.deepEqual(o, {});
      return function(req, res, next) {};
    },
  };
  var driver;
  var serviceManagerOptions;

  t.plan(6);

  var s = new Server(options);
  t.equal(driver.baseDir, options.baseDir);
  t.equal(driver.server, s);
  t.equal(serviceManagerOptions, s);
  t.end();
});

tap.test('mocked server construction with tracing', function(t) {
  process.env.STRONGLOOP_DEBUG_MINKELITE = 'YES';
  t.on('end', function() {
    delete process.env.STRONGLOOP_DEBUG_MINKELITE;
  });

  var serviceManager = {};
  var options = {
    cmdName: 'pm',
    baseDir: '_base',
    listenPort: 0,
    controlPath: null,
    enableTracing: true,
    // Environment: XXX(sam) don't bother, this is about to be rewritten
    Driver: function(o) {
      return {on: function() {}};
    },
    ServiceManager: function(o) {
      return serviceManager;
    },
    MeshServer: function(_serviceManager, o) {
      console.error('MeshServer options: %j', o);
      t.equal(_serviceManager, serviceManager);
      t.equal(o['trace.enable'], true);
      t.equal(o['trace.db.path'], options.baseDir);
      t.equal(o['trace.enableDebugServer'], 'YES');

      return function(req, res, next) {};
    },
  };

  t.plan(4);

  var s = new Server(options);
});

tap.test('driver methods are forwarded', function(t) {
  var svcId = 7;
  var startOptions = {};
  var req = {};
  var res = {};
  var options = {
    cmdName: 'pm',
    baseDir: '_base',
    listenPort: 0,
    controlPath: null,
    enableTracing: true,
    // Environment: XXX(sam) don't bother, this is about to be rewritten
    Driver: function(o) {
      return driver;
    },
    ServiceManager: function(o) {
      return serviceManager;
    },
    MeshServer: function(_serviceManager, o) {
      return function(req, res, next) {};
    },
  };
  var serviceManager = {
    setServiceState: function(_svcId, started, callback) {
      t.equal(_svcId, svcId);
      t.equal(started, true);
      setImmediate(callback);
    },
  };
  var driver = {
    on: function() {},
    setStartOptions: function(_svcId, _startOptions) {
      t.equal(_svcId, svcId);
      t.equal(_startOptions, startOptions);
    },
    deployService: function(_svcId, _req, _res) {
      t.equal(_svcId, svcId);
      t.equal(_req, req);
      t.equal(_res, res);
    },
    dumpServiceLog: function(_svcId) {
      t.equal(_svcId, svcId);
      return 'LOG';
    },
    startService: function(_svcId, callback) {
      t.equal(_svcId, svcId);
      setImmediate(callback);
    },
    stopService: function(_svcId, callback) {
      t.equal(_svcId, svcId);
      setImmediate(callback);
    },
  };

  t.plan(13);

  var s = new Server(options);
  s.setStartOptions(svcId, startOptions);

  s.deployService(svcId, req, res);

  t.equal(s.dumpServiceLog(svcId), 'LOG');

  s.startService(svcId, function(err) {
    t.ifError(err);
  });

  s.stopService(svcId, function(err) {
    t.ifError(err);
  });

  // TODO cover the rest of the methods. Could also cover the error branches,
  // I wish I had code coverage metrics :-(
});

// XXX(sam) test below needs re-writing into a unit test against public APIs,
// right now it depends on private methods of Driver, Container, and
// ServiceManager.

tap.test('service starts', function(t) {
  var s = new Server({
    cmdName: 'pm',
    baseDir: '_base',
    listenPort: 1234,
    controlPath: null,
  });
  var m = s._meshApp.models;
  var runner = s._driver._containerById(1);

  s._isStarted = true; // Make server think its running.
  s._serviceManager.loadModels(s._meshApp, firstRun);

  function firstRun() {
    debug('first run');
    var commit = {hash: 'hash1', dir: 'dir1'};

    runner.current = new MockCurrent();
    runner.current.commit = commit;

    // mock started event from runner
    s._onContainerStarted(runner, {
      cmd: 'started',
      appName: 'test-app',
      agentVersion: '1.0.0',
      pid: 1234
    }, checkInstance.bind(null, commit, secondRun));
  }

  function secondRun() {
    debug('second run');
    var commit = {hash: 'hash2', dir: 'dir2'};

    runner.current = new MockCurrent();
    runner.current.commit = commit;

    // mock started event from runner
    s._onContainerStarted(runner, {
      cmd: 'started',
      appName: 'test-app',
      agentVersion: '1.0.0',
      pid: 1234
    }, checkInstance.bind(null, commit, end));
  }

  function checkInstance(commit, next) {
    m.ServiceInstance.findById(1, function(err, _) {
      debug('instance: %j next: %j', _, next.name);
      assert.ifError(err);
      t.equal(_.id, 1);
      t.equal(_.executorId, 1);
      t.equal(_.serverServiceId, 1);
      t.equal(_.groupId, 1);
      t.equal(_.currentDeploymentId, commit.hash);
      t.assert(_.startTime < new Date());
      t.equal(s._listenPort, 1234);
      t.equal(_.PMPort, s._listenPort);

      m.ServerService.findById(1, function(err, _) {
        debug('service: %j', _);
        assert.ifError(err);
        t.equal(_.id, 1);
        t.equal(_.deploymentInfo.hash, commit.hash);
        t.equal(_.deploymentInfo.dir, commit.dir);
        next();
      });
    });
  }

  function end() {
    var tasks = {
      ServerService: 0,
      Executor: 0,
      ServiceInstance: 0,
      Group: 0,
    };
    for (var type in tasks) {
      tasks[type] = function(callback) {
        m[type].count(callback);
      };
    }

    async.parallel(tasks, function(counts) {
      debug('counts: %j', counts);

      for (var type in counts) {
        t.equal(counts[type], 1, type);
      }
      t.end();
    });
  }
});
