var debug = require('debug')('strong-pm:service-instance');
var fs = require('fs');
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

  ServiceInstance.prototype.downloadProfile = function downloadProfile(ctx) {
    var ProfileData = ServiceInstance.app.models.ProfileData;
    var profileId = ctx.req.param('profileId');
    var res = ctx.res;
    var fileName;

    ProfileData.findById(profileId, sendProfile);

    function sendProfile(err, profile) {
      if (err) {
        res.statusCode = 404;
        return res.end(util.format('Profile data not found: %s', err.message));
      }

      if (profile.errored) {
        var reason = util.format('Profiling failed: %s', profile.errored);
        debug('profile %d errored 500/%s', profileId, reason);
        res.statusCode = 500;
        return res.end(reason);
      }

      if (profile.completed) {
        fileName = profile.fileName;
        return fs.stat(fileName, checkandSendFile);
      }

      // Else, not complete
      res.statusCode = 204;
      return res.end('not yet completed');
    }

    function checkandSendFile(err, stat) {
      if (err) {
        res.statusCode = 404;
        return res.end('Profile data not found.');
      }

      readStream = fs.createReadStream(fileName);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Content-Disposition', 'attachment; filename=' + fileName);
      readStream.pipe(res);
    }
  };

  // Only allow updating ServiceInstance
  ServiceInstance.disableRemoteMethod('create', true);
  ServiceInstance.disableRemoteMethod('upsert', true);
  ServiceInstance.disableRemoteMethod('deleteById', true);
  ServiceInstance.disableRemoteMethod('deleteAll', true);
};
