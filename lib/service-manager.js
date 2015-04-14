'use strict';

var MeshServiceManager = require('strong-mesh-models').ServiceManager;
var _ = require('lodash');
var assert = require('assert');
var async = require('async');
var debug = require('debug')('strong-pm:service-manager');
var util = require('util');

function ServiceManager(server) {
  this._server = server;
  // Initialized in loadModels, there is a circular dependency between them and
  // the ServiceManager.
  this._meshApp = null;
}

util.inherits(ServiceManager, MeshServiceManager);

var prototype = ServiceManager.prototype;

prototype.loadModels = function(meshApp, callback) {
  debug('load models');

  this._meshApp = meshApp;

  var models = meshApp.models;

  var Executor = models.Executor;

  var executor = new Executor({
    id: 1,
    address: 'localhost',
    APIPort: this._listenPort,
  });

  async.parallel([
    executor.save.bind(executor),
    this._loadServiceModels.bind(this, 1),
  ], callback);
};

prototype._loadServiceModels = function(svcId, callback) {
  // Note that svcId == the groupId == the instanceId. This isn't necessarily
  // true, but since we are auto-creating them, it happens. For the executor,
  // though, there is only the one, id `1`.
  var models = this._meshApp.models;

  var Group = models.Group;
  var Service = models.ServerService;
  var Instance = models.ServiceInstance;

  var group = new Group({
    id: svcId,
    name: 'default',
    scale: 1,
  });

  /* eslint eqeqeq:0 */
  var service = new Service({
    id: svcId,
    name: svcId == 1 ? 'default' : 'svc-' + svcId, // XXX(sam) better name?
    _groups: [group],
    env: this._server.env(svcId),
  });

  var instance = new Instance({
    id: svcId,
    executorId: 1,
    serverServiceId: svcId,
    groupId: svcId,
    cpus: 'CPU',
  });

  async.parallel([
    group.save.bind(group),
    service.save.bind(service),
    instance.save.bind(instance),
  ], callback);
};

prototype.containerStarted = function(svcId, started, callback) {
  var self = this;
  var commit = started.containerVersionInfo.commit;

  if (svcId !== 1) {
    // XXX(sam) ugly hack... should probably search, or check for error in
    // setServiceCommit... or something. Lv as is for now, soon the services
    // will be persisted, and this code will dissappear.
    self._loadServiceModels(svcId, function(err) {
      if (err) return callback(err);
      containerStarted(svcId, started, callback);
    });
  } else {
    containerStarted(svcId, started, callback);
  }

  function containerStarted(svcId, started, callback) {
    self._meshApp.setServiceCommit(svcId, commit, handleModelUpdate);

    function handleModelUpdate(err) {
      if (err) return callback(err);
      self._meshApp.handleModelUpdate(svcId, started, callback);
    }
  }
};

prototype.setServiceState = function(svcId, started, callback) {
  var ServiceInstance = this._models.ServiceInstance;
  // XXX(sam) should look for svcId!
  ServiceInstance.findOne(function(err, instance) {
    if (err) {
      debug(err);
      // XXX(sam) should say the svc couldn't be found
      return callback(Error('Unable to modify service state'));
    }

    instance.started = started;
    instance.save(function(err) {
      // XXX(sam) should assert ifError?
      if (err) {
        debug(err);
        return callback(Error('Unable to modify service state'));
      }
      callback();
    });
  });
};

prototype.onCtlRequest = function(service, instance, req, callback) {
  req.serviceId = service.id;
  req.instanceId = instance.id;
  this.apiRequest(req, callback);
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
  instance.serverService(function(err, service) {
    assert.ifError(err);

    if (isNaN(parseInt(instance.cpus))) {
      instance.cpus = 'STRONGLOOP_CLUSTER' in process.env ?
        process.env.STRONGLOOP_CLUSTER : 'CPU';
    }
    self._server.setStartOptions(service.id, {size: instance.cpus});
    setImmediate(callback);
  });
};

prototype.onServiceUpdate = function(service, callback) {
  var svcId = service.id;
  var localEnv = this._server.env(svcId);
  if (!_.isEqual(service.env, localEnv)) {
    // updateEnv uses nulls to indicate unsetting of existing variables
    var mask = _.mapValues(localEnv, _.constant(null));
    var update = _.defaults({}, service.env, mask);
    this._server.updateEnv(svcId, update, callback);
  } else {
    setImmediate(callback);
  }
};

prototype.onDeployment = function(service, req, res) {
  debug('onDeployment: svc %j', service);
  this._server.onDeployment(service, req, res);
};

module.exports = ServiceManager;
