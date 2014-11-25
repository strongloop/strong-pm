var debug = require('debug')('strong-pm:service-instance');
var runConfig = require('../config');
var util = require('util');

module.exports = function(ServiceInstance) {
  ServiceInstance.beforeRemote(
    'prototype.updateAttributes',
    function(ctx, _, next) {
      debug('updateAttributes with %j', ctx.args.data);
      // When updating the instance via REST, only allow changes to cpus
      ctx.args.data = {
        cpus: ctx.args.data['cpus']
      };
      next();
    }
  );

  ServiceInstance.beforeUpdate = function beforeUpdate(next) {
    if (isNaN(parseInt(this.cpus))) {
      this.cpus = 'CPU';
    }
    debug('Updating starting cluster size to %d', this.cpus);
    debug('  start was: %j', runConfig.configDefaults['start']);
    runConfig.configDefaults['start'] =
      [util.format('sl-run --cluster=%s', this.cpus)];
    debug('  start now: %j', runConfig.configDefaults['start']);
    next();
  };

  // Only allow updating ServiceInstance
  ServiceInstance.disableRemoteMethod('create', true);
  ServiceInstance.disableRemoteMethod('upsert', true);
  ServiceInstance.disableRemoteMethod('deleteById', true);
  ServiceInstance.disableRemoteMethod('deleteAll', true);
};
