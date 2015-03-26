var _ = require('lodash');
var MeshServiceManager = require('strong-mesh-models').ServiceManager;
var configDefaults = require('./config').configDefaults;
var debug = require('debug')('strong-pm:service-manager');
var util = require('util');

function ServiceManager(server) {
  this.server = server;
}
util.inherits(ServiceManager, MeshServiceManager);

// XXX(sam) I think onCtlRequest and server._onCtlRequest would make more sense
ServiceManager.prototype.ctlRequest =
  function ctlRequest(service, instance, req, callback) {
    debug('ctlRequest: %j', req);
    this.server._ctlRequestListener(req, function(res) {
      if (res.error) return callback(Error(res.error));
      callback(null, res);
    });
  };

// XXX(sam) should call into server._onInstanceUpdate, avoid dependency on
// configDefaults module global, and eventually there will be more options
// that --cluster (like --trace) to sl-run.
ServiceManager.prototype.onInstanceUpdate =
  function onInstanceUpdate(instance, callback) {
    if (isNaN(parseInt(instance.cpus))) {
      // XXX(sam) disallows setting STRONGLOOP_CLUSTER to `"0"`
      instance.cpus = process.env.STRONGLOOP_CLUSTER || 'CPU';
    }
    debug('Updating starting cluster size to %d', instance.cpus);
    debug('  start was: %j', configDefaults.start);
    configDefaults.start =
      [util.format('sl-run --cluster=%s', instance.cpus)];
    debug('  start now: %j', configDefaults.start);
    setImmediate(callback);
  };

ServiceManager.prototype.onServiceUpdate =
  function onServiceUpdate(instance, callback) {
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

// XXX(sam) onDeployment is in base, but not defined, perhaps its no longer
// used and should be removed from MeshServiceManager?

module.exports = ServiceManager;
