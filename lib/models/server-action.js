var debug = require('debug')('strong-pm:server-action');
var ipcctl = require('../ipcctl');
var path = require('path');
var util = require('util');

module.exports = function(ServerAction) {
  ServerAction.beforeCreate = function beforeCreate(next) {
    var app = ServerAction.app;
    var now = Date.now();
    var req = this.request;
    var self = this;

    debug('enter before create: %j', self);

    this.timestamp = now;
    this.result = {};

    switch (this.request.sub) {
      case 'stop-cpu-profiling':
        return beginProfile(app, now, req.target, 'cpuprofile', save);
      case 'heap-snapshot':
        return beginProfile(app, now, req.target, 'heapsnapshot', save);
      default: {
        app._ctlRequestListener(this.request, function(res) {
          self.result = res;
          next();
        });
        return;
      }
    }

    function save(err, profile) {
      if (err) return next(err);
      util._extend(self.result, profile);
      next();
    }
  }

  // FIXME @kraman, I don't understand why we can't use just the beforeCreate,
  // why do we have to do some things afterCreate?
  ServerAction.afterCreate = function afterCreate(next) {
    var app = ServerAction.app;
    var cmd = this.request.sub;
    var target = this.request.target;
    var profileId = this.result.profileId;
    var fileName;

    switch (cmd) {
      case 'stop-cpu-profiling':
      case 'heap-snapshot': {
        fileName = path.resolve('profile.' + profileId + '.' + cmd);
        var req = {
          cmd: 'current',
          sub: cmd,
          target: target,
          filePath: fileName,
        };
        app._ctlRequestListener(req, complete);
        setImmediate(next);
        break;
      }

      default:
        setImmediate(next);
    }

    debug('after create: %j', this);

    function complete(res) {
      endProfile(app, profileId, fileName, res);
    }
  }
}

function endProfile(app, profileId, fileName, res) {
  var ProfileData = app.models.ProfileData;
  var update = {
    id: profileId
  };

  if (res.error) {
    update.errored = res.error;
  } else {
    update.completed = true;
    update.fileName = fileName;
  }

  ProfileData.upsert(update, function(err, profile) {
    debug('end profile after create: %j', err || profile);
    if (err) {
      console.error('Unrecoverable error upserting %j', update);
      throw err;
    }
  });
}

function beginProfile(app, now, target, type, callback) {
  var ProfileData = app.models.ProfileData;
  var ServerService = app.models.ServerService;

  if (target == null) {
    return callback(Error('Missing required argument: `target`'));
  }

  var profile = ProfileData({
    executorId: 1,
    serverServiceId: 1,
    instanceId: 1,
    targetId: target,
    type: type,
    startTime: now
  });

  profile.save(function(err, profile) {
    if (err) return callback(err);

    var pathname = [
      app.get('restApiRoot'),
      ServerService.sharedClass.http.path,
      '1',
      ProfileData.sharedClass.http.path,
      String(profile.id),
      'download'
    ].join('/').replace(/\/+/g, '/'); // Compress // to /

      debug('begin profile: %j', profile, pathname);

      callback(null, {
        profileId: profile.id,
        url: pathname,
      });
  });
}
