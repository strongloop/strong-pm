var _ = require('lodash');
var MeshServiceManager = require('strong-mesh-models').ServiceManager;
var assert = require('assert');
var debug = require('debug')('strong-pm:service-manager');
var util = require('util');

function ServiceManager(server) {
  this.server = server;
}
util.inherits(ServiceManager, MeshServiceManager);

var prototype = ServiceManager.prototype;

prototype.onCtlRequest = function(service, instance, req, callback) {
  debug('onCtlRequest: %j', req);
  this.server._onCtlRequest(req, function(res) {
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
    self.server.setStartOptions(service.id, {size: instance.cpus});
    setImmediate(callback);
  });
};

prototype.onServiceUpdate = function(service, callback) {
  var svcId = service.id;
  var localEnv = this.server.env(svcId);
  if (!_.isEqual(service.env, localEnv)) {
    // updateEnv uses nulls to indicate unsetting of existing variables
    var mask = _.mapValues(localEnv, _.constant(null));
    var update = _.defaults({}, service.env, mask);
    this.server.updateEnv(svcId, update, callback);
  } else {
    setImmediate(callback);
  }
};

prototype.onDeployment = function(service, req, res) {
  debug('onDeployment: svc %j', service);
  this.server.onDeployment(service, req, res);
};

module.exports = ServiceManager;
