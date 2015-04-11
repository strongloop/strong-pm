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
  this._models = null;
}

util.inherits(ServiceManager, MeshServiceManager);

var prototype = ServiceManager.prototype;

prototype.loadModels = function(models, callback) {
  debug('load models');

  this._models = models;

  var Executor = models.Executor;
  var Group = models.Group;
  var Service = models.ServerService;
  var Instance = models.ServiceInstance;

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

  var svcId = 1;
  var service = new Service({
    id: svcId,
    name: 'default',
    _groups: [group],
    env: this._server.env(svcId),
  });

  var instance = new Instance({
    id: 1,
    executorId: 1,
    serverServiceId: 1,
    groupId: 1,
    cpus: 'CPU',
  });

  async.parallel([
    executor.save.bind(executor),
    group.save.bind(group),
    service.save.bind(service),
    instance.save.bind(instance),
  ], callback);
};

prototype.onCtlRequest = function(service, instance, req, callback) {
  debug('onCtlRequest: %j', req);
  this._server._onCtlRequest(req, function(res) {
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
