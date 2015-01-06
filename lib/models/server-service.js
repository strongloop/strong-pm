var debug = require('debug')('strong-pm:server-service');
var fs = require('fs');
var util = require('util');

module.exports = function(ServerService) {
  ServerService.disableRemoteMethod('create', true);
  ServerService.disableRemoteMethod('upsert', true);
  ServerService.disableRemoteMethod('updateAttributes');
  ServerService.disableRemoteMethod('deleteById', true);
  ServerService.disableRemoteMethod('updateAll', true);

  ServerService.disableRemoteMethod('getPack');

  ServerService.prototype.deploy = function deploy(ctx) {
    ServerService.app._deploymentReceiver(ctx.req, ctx.res);
  };
};
