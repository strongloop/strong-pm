'use strict';

var ServiceManager = require('../lib/service-manager');
var meshServer = require('strong-mesh-models').meshServer;
var tap = require('tap');

tap.test('old-style git deploy', function(t) {
  var req = {
    url: '/default/a-bunch?of-git-stuff',
  };
  var res = {
    set: function(key, value) {
      console.error('set: %j %j', key, value);
      return this;
    },
    status: function(status) {
      console.error('status: %j', status);
      return this;
    },
    end: function(body) {
      t.assert(false, body);
      t.end();
    },
  };
  function next() {}
  var server = {
    getDefaultEnv: function() {
      return {};
    },
    updateInstanceEnv: function(_, __, callback) {
      callback();
    },
    deployInstance: deployInstance,
    setStartOptions: function() {},
  };
  var sm = new ServiceManager(server);
  var meshApp = meshServer(sm);

  sm.initOrUpdateDb(meshApp, function(err) {
    t.ifError(err, 'load failed');

    sm.handle(req, res, next);
  });

  function deployInstance(_, _req, _res) {
    t.equal(_req, req);
    t.equal(_res, res);
    t.end();
  }
});

tap.test('old-style local or pack deploy', function(t) {
  var req = {
    url: '/default',
  };
  var res = {};
  function next() {}
  var server = {
    getDefaultEnv: function() {
      return {};
    },
    updateInstanceEnv: function(_, __, callback) {
      callback();
    },
    deployInstance: deployInstance,
    setStartOptions: function() {},
  };
  var sm = new ServiceManager(server);
  var meshApp = meshServer(sm);

  sm.initOrUpdateDb(meshApp, function(err) {
    t.ifError(err, 'load failed');

    sm.handle(req, res, next);
  });

  function deployInstance(_, _req, _res) {
    t.equal(_req, req);
    t.equal(_res, res);
    t.end();
  }
});

tap.test('old-style leaves non-deploy routes alone', function(t) {
  var req = {
    url: '/api',
  };
  var res = {};
  function next() {
    t.assert(true, 'passes through');
    t.end();
  }
  var server = {
    getDefaultEnv: function() {
      return {};
    },
    updateInstanceEnv: function(_, __, callback) {
      callback();
    },
    setStartOptions: function() {},
  };
  var sm = new ServiceManager(server);
  var meshApp = meshServer(sm);

  sm.initOrUpdateDb(meshApp, function(err) {
    t.ifError(err, 'load failed');

    sm.handle(req, res, next);
  });
});


tap.test('construction', function(t) {
  var server = {};
  var sm = new ServiceManager(server);
  t.equal(sm._server, server);
  t.end();
});

tap.test('loadModels', function(t) {
  var server = {
  };
  var sm = new ServiceManager(server);
  var meshApp = meshServer(sm);

  t.plan(1);

  sm.initOrUpdateDb(meshApp, function(err) {
    t.ifError(err, 'load failed');

    // TODO assert that all id `1` models have been created
  });
});

tap.test('onCtlRequest success', function(t) {
  var svc = {id: 3};
  var ins = {id: 9};
  var req = {cmd: 'hi'};
  var res = {ok: true};
  var server = {
    onCtlRequest: function(r, callback) {
      t.equal(r.cmd, req.cmd);
      t.equal(r.serviceId, svc.id);
      t.equal(r.instanceId, ins.id);
      return callback(res);
    },
  };
  var sm = new ServiceManager(server);

  t.plan(5);

  sm.onCtlRequest(svc, ins, req, function(err, r) {
    t.ifError(err);
    t.deepEqual(r, res);
  });
});

tap.test('onCtlRequest failure', function(t) {
  var svc = {id: 3};
  var ins = {id: 9};
  var req = {cmd: 'hi'};
  var res = {error: 'description'};
  var server = {
    onCtlRequest: function(req, callback) {
      return callback(res);
    },
  };
  var sm = new ServiceManager(server);

  t.plan(1);

  sm.onCtlRequest(svc, ins, req, function(err) {
    t.equal(err.message, res.error);
  });
});

// onApiRequest covered by onCtlRequest

/* XXX(sam) test broken by changes in service manager, commenting out

tap.test('non-default service initialization', function(t) {
  var svcId = 1;
  var server = {
    env: function() { return {}; },
    setStartOptions: function(_svcId, options) {
      t.equal(_svcId, svcId, 'svcId');
      t.equal(options.size, 'CPU', 'start size');
    },
  };
  var sm = new ServiceManager(server);
  var meshApp = meshServer(sm);
  var startedInfo = {
    containerVersionInfo: {
      commit: {},
    },
  };

  sm.initOrUpdateDb(meshApp, start);
  // XXX(sam) integrate these assertions after loadModels()
  //var m = s._meshApp.models;
  //m.Executor.findById(1, function(err, _) {
  //  debug('executor:', _);
  //  assert.ifError(err);
  //  t.equal(_.id, 1);
  //  t.equal(_.address, 'localhost');
  //});
  //m.ServerService.findById(1, function(err, _) {
  //  debug('service:', _);
  //  assert.ifError(err);
  //  t.equal(_.id, 1);
  //  t.equal(_.name, 'default');
  //  t.equal(_._groups[0].id, 1);
  //  t.equal(_._groups[0].name, 'default');
  //  t.equal(_._groups[0].scale, 1);
  //});


  function start() {
    svcId = 7;
    sm.instanceStarted(svcId, startedInfo, function(err) {
      t.ifError(err);
      // TODO assert service 7 is loaded in models
      setState();
    });
  }

  function setState() {
    sm.setServiceState(svcId, true, function(err, r) {
      t.assert(true);
      // TODO assert instance.started is true in models
      t.end();
    });
  }
});
*/
