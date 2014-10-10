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

  ServerService.prototype.downloadProfile = function downloadProfile(ctx) {
    var ProfileData = ServerService.app.models.ProfileData;
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
}
