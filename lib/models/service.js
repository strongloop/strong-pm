var debug = require('debug')('strong-pm:service');
var runConfig = require('../config');
var util = require('util');

module.exports = function(Service) {
  Service.disableRemoteMethod('create', true);
  Service.disableRemoteMethod('upsert', true);
  Service.disableRemoteMethod('deleteById', true);
  Service.disableRemoteMethod('updateAll', true);
  Service.disableRemoteMethod('getPack');

  //Only allow updating the group cpus
  Service.beforeRemote(
    'prototype.updateAttributes',
    function(ctx, _, next) {
      debug('updateAttributes with %j', ctx.args.data);

      // When updating the service via REST, only allow changes to cpus
      var cpus = 'CPU';
      if (ctx.args.data && ctx.args.data._groups && ctx.args.data._groups[0]) {
        cpus = ctx.args.data._groups[0].cpus || 'CPU';
      }

      ctx.args.data = {
        _groups: [
          {
            id: Service.app.pmServer.groupId,
            cpus: cpus,
            name: 'default',
            scale: 1
          }
        ]
      };
      next();
    }
  );

  Service.beforeUpdate = function beforeUpdate(next) {
    if (isNaN(parseInt(this._groups[0].cpus))) {
      this._groups[0].cpus = 'CPU';
    }
    debug('Updating starting cluster size to %d', this._groups[0].cpus);
    debug('  start was: %j', runConfig.configDefaults['start']);
    runConfig.configDefaults['start'] =
      [util.format('sl-run --cluster=%s', this._groups[0].cpus)];
    debug('  start now: %j', runConfig.configDefaults['start']);
    next();
  };

  Service.prototype.deploy = function deploy(ctx) {
    Service.app._deploymentReceiver(ctx.req, ctx.res);
  };
}

