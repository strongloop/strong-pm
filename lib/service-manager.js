'use strict';

var MeshServiceManager = require('strong-mesh-models').ServiceManager;
var assert = require('assert');
var async = require('async');
var debug = require('debug')('strong-pm:service-manager');
var fmt = require('util').format;
var util = require('util');
var extend = require('util')._extend;

module.exports = ServiceManager;

function ServiceManager(server) {
  this._server = server;
  this._meshApp = null;
}

util.inherits(ServiceManager, MeshServiceManager);

var prototype = ServiceManager.prototype;

prototype.initOrUpdateDb = function(meshApp, callback) {
  debug('initOrUpdateDb');

  this._meshApp = meshApp;
  var models = meshApp.models;
  var Executor = models.Executor;
  var Service = models.ServerService;

  var self = this;
  // Set the default environment for any new services that are created
  Service.definition.properties.env.default = function() {
    return self._server.getDefaultEnv();
  };

  Executor.findById('1', function(err, executor) {
    if (err) return callback(err);
    if (!executor) {
      return self._initDb(callback);
    }

    executor.APIPort = self._listenPort;
    executor.save(callback);
  });
};

prototype._initDb = function _initDb(callback) {
  var models = this._meshApp.models;
  var Executor = models.Executor;

  var executor = new Executor({
    id: 1,
    address: 'localhost',
    APIPort: this._listenPort,
  });

  executor.save(callback);
};

prototype.instanceStarted = function(instanceId, started, callback) {
  var self = this;
  var commit = started.containerVersionInfo.commit;
  var meshApp = self._meshApp;

  var ServiceInstance = this._meshApp.models.ServiceInstance;
  ServiceInstance.findById(instanceId, function(err, instance) {
    if (err) return callback(err);

    var serviceId = instance.serverServiceId;
    async.series([
      meshApp.setServiceCommit.bind(meshApp, serviceId, commit),
      self.setServiceState.bind(self, serviceId, true),
      meshApp.handleModelUpdate.bind(meshApp, instanceId, started)
    ], callback);
  });
};

prototype.setServiceState = function(svcId, started, callback) {
  var ServiceInstance = this._meshApp.models.ServiceInstance;
  var where = {where: {serverServiceId: svcId}};
  ServiceInstance.findOne(where, function(err, instance) {
    debug('setServiceState: svc %j to %j', svcId, started);

    assert.ifError(err);
    assert(instance, fmt('svcId %j', svcId));

    instance.started = started;
    instance.save(function(err) {
      assert.ifError(err);
      callback();
    });
  });
};

prototype.onCtlRequest = function(service, instance, req, callback) {
  req.serviceId = service.id;
  req.instanceId = instance.id;
  this.onApiRequest(req, callback);
};

prototype.onApiRequest = function(req, callback) {
  debug('onCtlRequest: %j', req);

  this._server.onCtlRequest(req, function(res) {
    if (res.error) return callback(Error(res.error));
    callback(null, res);
  });
};

prototype.onInstanceUpdate = function(instance, callback) {
  //var self = this;
  instance = instance;
  process.nextTick(callback);
  /*
  // XXX(KR): todo?
  instance.serverService(function(err, service) {
    assert.ifError(err);

    if (isNaN(parseInt(instance.cpus))) {
      instance.cpus = 'STRONGLOOP_CLUSTER' in process.env ?
        process.env.STRONGLOOP_CLUSTER : 'CPU';
    }
    self._server.setStartOptions(instance.id, {size: instance.cpus});
    setImmediate(callback);
  });
  */
};

prototype.onServiceUpdate = function(service, callback) {
  var self = this;

  function updateEnvironment(callback) {
    var env = getServiceEnv(service);

    service.instances(true, function(err, instances) {
      if (err) return callback(err);

      async.each(instances, updateInstanceEnv, callback);
      function updateInstanceEnv(instance, callback) {
        self._server.updateInstanceEnv(instance.id, env, callback);
      }
    });
  }

  function findOrCreateInstance(callback) {
    var models = self._meshApp.models;
    var Instance = models.ServiceInstance;

    service.instances(function(err, instances) {
      if (err) return callback(err);
      if (instances.length > 0) return callback();

      var instance = new Instance({
        executorId: 1,
        serverServiceId: service.id,
        groupId: 1,
        cpus: 'CPU',
      });
      instance.save(callback);
    });
  }

  async.series([findOrCreateInstance, updateEnvironment], callback);
};

prototype.onServiceDestroy = function(service, callback) {
  debug('onServiceDestroy: svc %j', service.id);

  var self = this;
  service.instances(function(err, instances) {
    if (err) return callback(err);

    async.each(instances, destroyInstance, callback);
    function destroyInstance(instance, callback) {
      self._server.destroyInstance(instance.id, callback);
    }
  });
};

prototype.onDeployment = function(service, req, res) {
  debug('onDeployment: svc %j', service.id);

  var self = this;
  service.instances(function(err, instances) {
    if (err) {
      debug(err);
      res.setHeaders(500, {});
      res.end('Error while deploying: ' + err.message);
      return;
    }
    if (instances.length <= 0) {
      debug(err);
      res.setHeaders(500, {});
      res.end('Error while deploying: no instance found');
      return;
    }
    var instance = instances[0];
    self._server.deployInstance(instance.id, req, res);
  });
};

prototype.getInstanceEnv = function(instanceId, callback) {
  var models = this._meshApp.models;
  var Instance = models.ServiceInstance;

  Instance.findById(instanceId, function(err, instance) {
    if (err) return callback(err);
    if (!instance)
      return callback(Error('Unable to find instance with id ' + instanceId));

    instance.serverService(function(err, service) {
      if (err) return callback(err);
      if (!service)
        return callback(
          Error('Unable to find service for instance with id ' + instanceId)
        );

      var env = getServiceEnv(service);
      debug('getInstanceEnv(%s) -> %j', instanceId, env);
      callback(null, env);
    });
  });
};

prototype.getInstanceMetas = function(callback) {
  var models = this._meshApp.models;
  var Instance = models.ServiceInstance;

  Instance.find(function(err, instances) {
    if (err) return callback(err);

    var metas = {};
    for (var i in instances) {
      if (!instances.hasOwnProperty(i)) continue;
      var instance = instances[i];
      metas[instance.id] = instance.containerVersionInfo;
    }
    callback(null, metas);
  });
};

function getServiceEnv(service) {
  return extend(service.env, {PORT: 3000 + service.id});
}
