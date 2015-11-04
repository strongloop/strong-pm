var _ = require('lodash');
var assert = require('assert');
var async = require('async');
var debug = require('debug')('strong-pm:test');
var EventEmitter = require('events').EventEmitter;
var path = require('path');
var Server = require('../lib/server');
var tap = require('tap');
var util = require('util');

var BASE = path.resolve(__dirname, '.strong-pm');
process.env.STRONGLOOP_MESH_DB = 'memory://';

tap.test('server test', function(t) {
// t.test('full server construction', function(tt) {
//  var server = new Server({
//    cmdName: 'pm',
//    baseDir: BASE,
//    listenPort: 0,
//  });
//  server.stop(tt.end.bind(tt));
// });
//
// t.test('mocked server construction', function(tt) {
//  var driver;
//  function MockDriver(o) {
//    this.options = o;
//    driver = this;
//  };
//
//  MockDriver.prototype.on = function(event) {
//    var wanted = 'request or listening';
//    if (event === 'request' || event === 'listening') {
//      wanted = event;
//    }
//    tt.equal(event, wanted, 'event handler must be registered');
//  };
//
//  MockDriver.prototype.stop = function(callback) {
//    callback();
//  };
//
//  var serviceManager;
//  function MockServiceManager(o) {
//    this.options = o;
//    this.handle = function(req,res,next) {};
//    serviceManager = this;
//  }
//
//  var server;
//  function MockMeshServerFactory(_serviceManager, minkelite,  o) {
//    tt.equal(_serviceManager, serviceManager, 'service manager must match');
//    tt.deepEqual(o, {}, 'mesh server options must match');
//    server = function(req, res, next) {};
//    return server;
//  }
//
//  var options = {
//    cmdName: 'pm',
//    baseDir: BASE,
//    listenPort: 0,
//    Driver: MockDriver,
//    ServiceManager: MockServiceManager,
//    MeshServer: MockMeshServerFactory
//  };
//
//  tt.plan(7);
//
//  var s = new Server(options);
//  tt.equal(driver.options.baseDir, options.baseDir, 'base dir must match');
//  tt.equal(driver.options.server, s, 'driver.server must match');
//  tt.equal(serviceManager.options, s,
//    'serviceManager options must match');
//  s.stop(tt.end.bind(tt));
// });
//
// t.test('driver methods are forwarded', function(tt) {
//  var startOptions = {};
//  var req = {};
//  var res = {};
//
//  var svcId = 10;
//  var instId = 10;
//
//  function MockDriver(o) {
//    this.options = o;
//    driver = this;
//  }
//
//  MockDriver.prototype.getName = _.constant('Mock');
//
//  MockDriver.prototype.on = function(event) {
//    var wanted = 'request or listening';
//    if (event === 'request' || event === 'listening') {
//      wanted = event;
//    }
//    tt.equal(event, wanted, 'event handler must be registered');
//  };
//
//  MockDriver.prototype.setStartOptions = function(_instId, _startOptions) {
//    tt.equal(_instId, instId, 'setStartOptions: instId must match');
//    tt.equal(_startOptions, startOptions,
//      'setStartOptions: start actions must match');
//  };
//
//  MockDriver.prototype.deployInstance = function(_instId, _req, _res) {
//    tt.equal(_instId, instId, 'deployInstance: instId must match');
//    tt.equal(_req, req, 'deployInstance: req must match');
//    tt.equal(_res, res, 'deployInstance: res must match');
//  };
//
//  MockDriver.prototype.dumpInstanceLog = function(_instId) {
//    tt.equal(_instId, instId, 'dumpInstanceLog: instId must match');
//    return 'LOG';
//  };
//
//  MockDriver.prototype.startInstance = function(_instId, callback) {
//    tt.equal(_instId, instId, 'startInstance: instId must match');
//    setImmediate(callback);
//  };
//
//  MockDriver.prototype.stopInstance = function(_instId, callback) {
//    tt.equal(_instId, instId, 'stopInstance: instId must match');
//    setImmediate(callback);
//  };
//
//  MockDriver.prototype.stop = function(callback) {
//    callback();
//  };
//
//  var serviceManager;
//  function MockServiceManager(o) {
//    this.options = o;
//    this.handle = function(req,res,next) {};
//    serviceManager = this;
//  }
//
//  var server;
//  function MockMeshServerFactory(_serviceManager, minkelite, o) {
//    tt.equal(_serviceManager, serviceManager, 'service manager must match');
//    server = function(req, res, next) {};
//    return server;
//  }
//
//  var options = {
//    cmdName: 'pm',
//    baseDir: BASE,
//    listenPort: 0,
//    enableTracing: true,
//    Driver: MockDriver,
//    ServiceManager: MockServiceManager,
//    MeshServer: MockMeshServerFactory
//  };
//
//  tt.plan(11);
//
//  var s = new Server(options);
//  s.setStartOptions(svcId, startOptions);
//  s.deployInstance(instId, req, res);
//  tt.equal(s.dumpInstanceLog(instId), 'LOG',
//    'dumpInstanceLog: log must match');
//
//  // TODO cover the rest of the methods. Could also cover the error branches,
//  // I wish I had code coverage metrics :-(
//  async.series([
//    s.startInstance.bind(s, instId),
//    s.stopInstance.bind(s, instId),
//  ], function() {
//    s.stop(tt.end.bind(tt));
//  });
// });

// XXX(sam) test below needs re-writing into a unit test against public APIs,
// right now it depends on private methods of Driver, Container, and
// ServiceManager.

  t.test('service starts', function(tt) {
    var svcId = -1;
    var instId = -1;
    var commit = {hash: '123', dir: '/some/dir'};

    function MockContainer() {
      this.current = {};
      this.current.commit = commit;
    }
    MockContainer.prototype.request = function request(req, cb) {
      if (req.cmd === 'status') {
        cb({master: {setSize: 1}});
      }
      if (req.cmd === 'npm-ls') {
        cb({});
      }
    };

    function MockDriver(o) {
      this.options = o;
      EventEmitter.call(this);
      this._containers = {};
    }
    util.inherits(MockDriver, EventEmitter);
    MockDriver.prototype.getName = _.constant('Mock');
    MockDriver.prototype.start = function(callback) {
      this.emit('request', instId, {
        cmd: 'started',
        appName: 'test-app',
        agentVersion: '1.0.0',
        wid: 0,
        pid: 1234,
        pst: Date.now(),
      });
      callback();
    };
    MockDriver.prototype.instanceById = function() {
      return this._containerById(instId).current;
    };
    MockDriver.prototype._containerById = function(instanceId) {
      var container = this._containers[instanceId];
      if (!container) {
        container = this._containers[instanceId] = new MockContainer();
      }
      return container;
    };
    MockDriver.prototype.requestOfInstance = function(instanceId, req, cb) {
      var container = this._containerById(instId);
      container.request(req, cb);
    };
    MockDriver.prototype.updateInstanceEnv =
      function(instanceId, env, callback) {
        callback();
      };
    MockDriver.prototype.setStartOptions = function() {};
    MockDriver.prototype.stop = function(callback) {
      callback();
    };

    var options = {
      cmdName: 'pm',
      baseDir: BASE,
      listenPort: 1234,
      enableTracing: false,
      Driver: MockDriver,
    };

    var s = new Server(options);
    var m = s._meshApp.models;
    var serviceManager = s._serviceManager;

    // Make server think its running.
    s._isStarted = true;
    async.series([
      serviceManager.initOrUpdateDb.bind(serviceManager, s._meshApp),
      createService,
      findInstance,
      firstRun,
      checkInstance,
      secondRun,
      checkInstance,
      end,
    ], function() {
      s.stop(tt.end.bind(tt));
    });

    function createService(callback) {
      debug('create service');
      m.ServerService.create({
        name: 'default',
        _groups: [m.Group({name: 'default', id: 1, scale: 1})],
      }, function(err, service) {
        tt.ifError(err, 'create svc');
        svcId = service.id;

        // Use setImmediate instead of nextTick so that hooks are run before
        // callback is invoked
        setImmediate(callback);
      });
    }

    function findInstance(callback) {
      m.ServiceInstance.findOne(
        {where: {serverServiceId: svcId}},
        function(err, inst) {
          tt.ifError(err, 'find svc');
          instId = inst.id;
          debug('instance assigned. Id: %s', instId);
          callback();
        }
      );
    }

    function firstRun(callback) {
      s._driver.start(function(err) {
        if (err) return callback(err);

        // Use setImmediate instead of nextTick so that hooks are run before
        // callback is invoked
        setImmediate(callback.bind(null, err));
      });
    }

    function secondRun(callback) {
      debug('second run');
      commit = {hash: 'hash2', dir: 'dir2'};

      // remove old container so new one is created
      s._driver._containers = {};

      s._driver.start(function(err) {
        // Use setImmediate instead of nextTick so that hooks are run before
        // callback is invoked
        setImmediate(callback.bind(null, err));
      });
    }

    function checkInstance(callback) {
      m.ServiceInstance.findById(instId, function(err, _inst) {
        debug('instance: %j', _inst);
        assert.ifError(err);
        tt.equal(_inst.id, instId);
        tt.equal(_inst.executorId, 1);
        tt.equal(_inst.serverServiceId, svcId);
        tt.equal(_inst.groupId, 1);
        tt.equal(_inst.currentDeploymentId, commit.hash);
        tt.assert(_inst.startTime < new Date());
        tt.equal(s._listenPort, 1234);
        tt.equal(_inst.PMPort, s._listenPort);

        m.ServerService.findById(svcId, function(err, _srv) {
          debug('service: %j', _srv);
          assert.ifError(err);
          tt.equal(_srv.id, 1);

          tt.equal(_srv.deploymentInfo.hash, commit.hash);
          tt.equal(_srv.deploymentInfo.dir, commit.dir);
          callback();
        });
      });
    }

    function end(callback) {
      var tasks = {
        ServerService: 0,
        Executor: 0,
        ServiceInstance: 0,
        Group: 0,
      };
      Object.keys(tasks).forEach(function(type) {
        tasks[type] = function(callback) {
          m[type].count(callback);
        };
      });

      async.parallel(tasks, function(counts) {
        debug('counts: %j', counts);

        for (var type in counts) {
          tt.equal(counts[type], 1, type);
        }

        callback();
      });
    }
  });

  t.end();
});
