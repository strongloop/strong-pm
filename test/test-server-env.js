var Server = require('../lib/server');
var mktmpdir = require('mktmpdir');
var fs = require('fs');
var path = require('path');
var test = require('tap').test;

process.env.STRONGLOOP_MESH_DB = 'memory://';
test('service environment', function(t) {
  mktmpdir(function(err, tmpdir, cleanup) {
    t.on('end', cleanup);

    function MockDriver(o) {
      this.options = o;
      driver = this;
    };
    MockDriver.prototype.on = function() {};

    function matchEnv(tt, env, expectedEnv) {
      // PORT env is auto assigned so it should exist but we can exclude it when
      // checking for a match
      var envCopy = JSON.parse(JSON.stringify(env));
      tt.assert(envCopy.PORT);
      delete envCopy.PORT;
      tt.deepEqual(envCopy, expectedEnv);
    }

    t.test('empty initial environment', function(tt) {
      fs.writeFileSync(path.join(tmpdir, 'env.json'), '{}');

      var s = new Server({
        cmdName: 'pm',
        baseDir: tmpdir,
        listenPort: 0,
        Driver: MockDriver,
      });
      var Service = s._meshApp.models.ServerService;
      s._serviceManager.initOrUpdateDb(s._meshApp, function(err) {
        tt.ifError(err);
        tt.deepEqual(s.getDefaultEnv(), {});
        MockDriver.prototype.updateInstanceEnv =
          function(instanceId, env, callback) {
            matchEnv(tt, env, {});
            callback();
          };
        Service.create({name: 'Service 1'}, function(err, service) {
          tt.ifError(err);
          matchEnv(tt, service.env, {});
          setImmediate(tt.end.bind(tt));
        });
      });
    });

    t.test('initial environment', function(tt) {
      var defEnv = {FOO: 'foo', BAR: 'bar'};
      var newEnv = {BAR: 'bar'};
      fs.writeFileSync(path.join(tmpdir, 'env.json'), JSON.stringify(defEnv));

      var s = new Server({
        cmdName: 'pm',
        baseDir: tmpdir,
        listenPort: 0,
        Driver: MockDriver,
      });
      var Service = s._meshApp.models.ServerService;
      s._serviceManager.initOrUpdateDb(s._meshApp, function(err) {
        tt.ifError(err);
        tt.deepEqual(s.getDefaultEnv(), defEnv);
        MockDriver.prototype.updateInstanceEnv =
          function(instanceId, env, callback) {
            matchEnv(tt, env, defEnv);
            callback();
          };
        Service.create({name: 'Service 1'}, function(err, service) {
          tt.ifError(err);
          matchEnv(tt, service.env, defEnv);
          setImmediate(updateEnv.bind(null, service));
        });
      });

      function updateEnv(service) {
        MockDriver.prototype.updateInstanceEnv =
          function(instanceId, env, callback) {
            matchEnv(tt, env, newEnv);
            callback();
          };
        service.env = JSON.parse(JSON.stringify(newEnv));
        service.save(function(err) {
          tt.ifError(err);
          setImmediate(tt.end.bind(tt));
        });
      }
    });

    t.end();
  });
});
