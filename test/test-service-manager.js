'use strict';

var ServiceManager = require('../lib/service-manager');
var meshServer = require('strong-mesh-models').meshServer;
var tap = require('tap');

tap.test('construction', function(t) {
  var server = {};
  var sm = new ServiceManager(server);
  t.equal(sm._server, server);
  t.end();
});

tap.test('loadModels', function(t) {
  var server = {
    env: function() { return {}; },
    setStartOptions: function(svcId, options) {
      t.equal(svcId, 1, 'svcId');
      t.equal(options.size, 'CPU', 'start size');
    },
  };
  var sm = new ServiceManager(server);
  var meshApp = meshServer(sm);

  t.plan(3);

  sm.loadModels(meshApp, function(err) {
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

  sm.onCtlRequest(svc, ins, req, function(err, r) {
    t.equal(err.message, res.error);
  });
});

// onApiRequest covered by onCtlRequest

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

  sm.loadModels(meshApp, start);

  function start() {
    svcId = 7;
    sm.containerStarted(svcId, startedInfo, function(err) {
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
