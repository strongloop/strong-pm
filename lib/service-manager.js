'use strict';

var MeshServiceManager = require('strong-mesh-models').ServiceManager;
var _ = require('lodash');
var assert = require('assert');
var async = require('async');
var debug = require('debug')('strong-pm:service-manager');
var fmt = require('util').format;
var util = require('util');

module.exports = ServiceManager;

function ServiceManager(server) {
  this._server = server;
  // Initialized in loadModels, there is a circular dependency between them and
  // the ServiceManager.
  this._meshApp = null;
}

util.inherits(ServiceManager, MeshServiceManager);

var prototype = ServiceManager.prototype;

prototype.initOrUpdateDb = function(meshApp, callback) {
  debug('initializeNewDb');

  this._meshApp = meshApp;
  var models = meshApp.models;
  var Executor = models.Executor;

  var self = this;
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
  var Group = models.Group;
  var Service = models.ServerService;

  var executor = new Executor({
    id: 1,
    address: 'localhost',
    APIPort: this._listenPort,
  });

  var group = new Group({
    id: 1,
    name: 'default',
    scale: 1,
  });

  var service = new Service({
    id: 1,
    name: 'default',
    _groups: [group],
//    env: this._server.getDefaultEnv(),
  });

  async.parallel([
    executor.save.bind(executor),
    service.save.bind(service),
  ], callback);
}

prototype.containerStarted = function(instanceId, started, callback) {
  var self = this;
  var commit = started.containerVersionInfo.commit;

  var ServiceInstance = this._meshApp.models.ServiceInstance;
  ServiceInstance.findById(instanceId, function(err, instance) {
    if (err) return callback(err);

    self._meshApp.setServiceCommit(
      instance.serverServiceId,
      commit,
      handleModelUpdate
    );

    function handleModelUpdate(err) {
      if (err) return callback(err);
      self._meshApp.handleModelUpdate(instanceId, started, callback);
    }
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
    console.log(new Error().stack);
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
  var self = this;
//  instance.serverService(function(err, service) {
//    assert.ifError(err);

    if (isNaN(parseInt(instance.cpus))) {
      instance.cpus = 'STRONGLOOP_CLUSTER' in process.env ?
        process.env.STRONGLOOP_CLUSTER : 'CPU';
    }
    self._server.setStartOptions(instance.id, {size: instance.cpus});
    setImmediate(callback);
//  });
};

prototype.onServiceUpdate = function(service, callback) {
  var svcId = service.id;
  var localEnv = this._server.env(svcId);
  var self = this;

  function updateEnvironment(callback) {
    if (!_.isEqual(service.env, localEnv)) {
      // updateEnv uses nulls to indicate unsetting of existing variables
      var mask = _.mapValues(localEnv, _.constant(null));
      var update = _.defaults({}, service.env, mask);
//      self._server.updateEnv(svcId, update, callback);
      callback();
    } else {
      setImmediate(callback);
    }
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
      console.log(new Error().stack);
      instance.save(callback);
    });
  }

  async.series([findOrCreateInstance, updateEnvironment], callback);
};

prototype.onServiceDestroy = function(service, callback) {
  debug('onServiceDestroy: svc %j', service.id);
  this._server.destroyService(service.id, callback);
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
