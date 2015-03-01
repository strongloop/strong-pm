var MeshServiceManager = require('strong-mesh-models').ServiceManager;
var configDefaults = require('./config').configDefaults;
var debug = require('debug')('strong-pm:service-manager');
var util = require('util');

function ServiceManager(server) {
  this.server = server;
}
util.inherits(ServiceManager, MeshServiceManager);

ServiceManager.prototype.ctlRequest =
  function ctlRequest(service, instance, req, callback) {
    debug('ctlRequest: %j', req);
    this.server._ctlRequestListener(req, function(res) {
      if (res.error) return callback(Error(res.error));
      callback(null, res);
    });
  };

ServiceManager.prototype.onInstanceUpdate =
  function onInstanceUpdate(instance, callback) {
    if (isNaN(parseInt(instance.cpus))) {
      instance.cpus = process.env.STRONGLOOP_CLUSTER || 'CPU';
    }
    debug('Updating starting cluster size to %d', instance.cpus);
    debug('  start was: %j', configDefaults.start);
    configDefaults.start =
      [util.format('sl-run --cluster=%s', instance.cpus)];
    debug('  start now: %j', configDefaults.start);
    setImmediate(callback);
  };

module.exports = ServiceManager;
