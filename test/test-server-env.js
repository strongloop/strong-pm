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
    MockDriver.prototype.on = function() {
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
        Service.create({name: 'Service 1'}, function(err, service) {
          tt.ifError(err);
          var env = service.env;
          delete env.PORT; // Remove the auto-assigned PORT env
          tt.deepEqual(env, {});
          tt.end();
        });
      });
    });

    t.test('initial environment', function(tt) {
      var fullEnv = {FOO: 'foo', BAR: 'bar'};
      fs.writeFileSync(path.join(tmpdir, 'env.json'), JSON.stringify(fullEnv));

      var s = new Server({
        cmdName: 'pm',
        baseDir: tmpdir,
        listenPort: 0,
        Driver: MockDriver,
      });
      var Service = s._meshApp.models.ServerService;
      s._serviceManager.initOrUpdateDb(s._meshApp, function(err) {
        tt.ifError(err);
        tt.deepEqual(s.getDefaultEnv(), fullEnv);
        Service.create({name: 'Service 1'}, function(err, service) {
          tt.ifError(err);
          var env = service.env;
          delete env.PORT; // Remove the auto-assigned PORT env
          tt.deepEqual(env, fullEnv);
          tt.end();
        });
      });
    });

    t.end();
  });
});
