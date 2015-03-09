var Server = require('../lib/server');
var mktmpdir = require('mktmpdir');
var test = require('tap').test;

test('new server', function(t) {
  mktmpdir(function(err, tmpdir, cleanup) {
    t.on('end', cleanup);

    var s = new Server('pm', tmpdir, 0, null);
    var Service = s._app.models.ServerService;
    var svc = null;

    var emptyEnv = {};
    var fullEnv = {FOO: 'foo', BAR: 'bar'};
    var barOnly = {BAR: 'bar'};

    t.test('start server', function(tt) {
      s.start(function(err) {
        tt.ifError(err);
        tt.end();
      });
    });

    t.test('initial environment', function(tt) {
      Service.findById(1, function(err, _svc) {
        tt.ifError(err, 'finds Service instance');
        svc = _svc;
        tt.equivalent(svc.env, emptyEnv, 'model env is empty');
        tt.equivalent(s.env({}), emptyEnv, 'local env is empty');
        tt.end();
      });
    });

    t.test('update env on model', function(tt) {
      svc.env = fullEnv;
      svc.save(function(err, res) {
        tt.ifError(err, 'saves without error');
        tt.equivalent(res.env, fullEnv, 'saved env on model');
        tt.end();
      });
    });

    t.test('update reflected locally', function(tt) {
      tt.equivalent(s.env({}), fullEnv, 'local env was updated');
      tt.end();
    });

    t.test('refresh Service instance', function(tt) {
      Service.findById(1, function(err, _svc) {
        tt.ifError(err, 'finds Service instance');
        svc = _svc;
        tt.end();
      });
    });

    t.test('update env with model#unsetEnv', function(tt) {
      svc.unsetEnv('FOO', function(err, res) {
        tt.ifError(err, 'unsetEnv does not fail');
        tt.equivalent(res, barOnly, 'setEnv returns new env');
        tt.end();
      });
    });

    t.test('update reflected locally', function(tt) {
      tt.equivalent(s.env({}), barOnly, 'local env was updated');
      tt.end();
    });

    t.test('update env with model#setEnv', function(tt) {
      svc.setEnv('FOO', 'foo', function(err, res) {
        tt.equivalent(res, fullEnv, 'setEnv sets variable');
        tt.end();
      });
    });

    t.test('update reflected locally', function(tt) {
      tt.equivalent(s.env({}), fullEnv, 'local env was updated');
      tt.end();
    });

    t.test('shutdown server', function(tt) {
      s.stop(function(err) {
        tt.ifError(err, 'server shutdown without error');
        tt.end();
      });
    });
  });
});
