var _ = require('lodash');
var MeshServiceManager = require('strong-mesh-models').ServiceManager;
var configDefaults = require('./config').configDefaults;
var debug = require('debug')('strong-pm:service-manager');
var util = require('util');

function ServiceManager(server) {
  this.server = server;
}
util.inherits(ServiceManager, MeshServiceManager);

var prototype = ServiceManager.prototype;

// XXX(sam) I think onCtlRequest and server._onCtlRequest would make more sense
prototype.ctlRequest = function(service, instance, req, callback) {
  debug('ctlRequest: %j', req);
  this.server._onCtlRequest(req, function(res) {
    if (res.error) return callback(Error(res.error));
    callback(null, res);
  });
};

// XXX(sam) should call into server._onInstanceUpdate, avoid dependency on
// configDefaults module global, and eventually there will be more options
// that --cluster (like --trace) to sl-run.
prototype.onInstanceUpdate = function(instance, callback) {
  if (isNaN(parseInt(instance.cpus))) {
    // XXX(sam) disallows setting STRONGLOOP_CLUSTER to `"0"`
    instance.cpus = process.env.STRONGLOOP_CLUSTER || 'CPU';
  }
  debug('Updating starting cluster size to %d', instance.cpus);
  debug('  start was: %j', this.server.getStartCommand());
  this.server.setStartOptions({size: instance.cpus});
  debug('  start now: %j', this.server.getStartCommand());
  setImmediate(callback);
};

prototype.onServiceUpdate = function(instance, callback) {
  var localEnv = this.server.env();
  if (!_.isEqual(instance.env, localEnv)) {
    // updateEnv uses nulls to indicate unsetting of existing variables
    var mask = _.mapValues(localEnv, _.constant(null));
    var update = _.defaults({}, instance.env, mask);
    this.server.updateEnv(update, callback);
  } else {
    setImmediate(callback);
  }
};

prototype.onDeployment = function(service, req, res) {
  debug('onDeployment: svc %j', service);
  this.server.onDeployment(service, req, res);
};

module.exports = ServiceManager;
