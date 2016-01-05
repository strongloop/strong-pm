var EventEmitter = require('events').EventEmitter;
var Server = require('../lib/server');
var _ = require('lodash');
var assert = require('assert');
var async = require('async');
var debug = require('debug')('strong-pm:test');
var mktmpdir = require('mktmpdir');
var tap = require('tap');
var util = require('util');

tap.test('server test', function(t) {
  mktmpdir(function(err, tmpdir, done) {
    t.ifError(err);
    // t.on('end', done);
    var BASE = tmpdir;
    console.log(BASE);

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

          // Use setTimeout so that hooks are run before callback is invoked
          setTimeout(callback, 1000);
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

          // Use setTimeout so that hooks are run before callback is invoked
          setTimeout(callback.bind(null, err), 1000);
        });
      }

      function secondRun(callback) {
        debug('second run');
        commit = {hash: 'hash2', dir: 'dir2'};

        // remove old container so new one is created
        s._driver._containers = {};

        s._driver.start(function(err) {
          // Use setTimeout so that hooks are run before callback is invoked
          setTimeout(callback.bind(null, err), 1000);
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
});
