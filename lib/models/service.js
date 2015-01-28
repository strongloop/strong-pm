var debug = require('debug')('strong-pm:service');

module.exports = function(Service) {
  Service.disableRemoteMethod('create', true);
  Service.disableRemoteMethod('upsert', true);
  Service.disableRemoteMethod('updateAttributes');
  Service.disableRemoteMethod('deleteById', true);
  Service.disableRemoteMethod('updateAll', true);

  Service.disableRemoteMethod('getPack');

  Service.prototype.deploy = function deploy(ctx) {
    Service.app._deploymentReceiver(ctx.req, ctx.res);
  };
}

