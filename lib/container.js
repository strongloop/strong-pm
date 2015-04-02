'use strict';

var App = require('strong-runner').App;
var assert = require('assert');
var bl = require('bl');
var c2s = require('strong-runner').Runnable.toString;
var cicada = require('strong-fork-cicada');
var debug = require('debug')('strong-pm:container');
var fs = require('fs');
var localDeploy = require('./local-deploy');
var packReceiver = require('./pack-receiver');
var path = require('path');
var prepare = require('./prepare').prepare;
var util = require('util');

function mandatory(value) {
  assert(value);
  return value;
}

// XXX(sam) commit needs to have toString set to Runnable.c2s

// FIXME we must, at minimum, check that the commit has a top-level
// package.json, if it doesn't, the npm commands will search upwards and cause a
// npm rebuild and npm install --production of strong-pm itself!

module.exports = exports = Container;

function Container(options) {
  if (!(this instanceof Container))
    return new Container(options);

  App.call(this, options);

  //this.restartCount = 0; // XXX(sam) move here from strong-runner.App?
  this._appLog = bl();
  this._logGcTimer = setInterval(
    this._gcLogs.bind(this),
    exports.LOG_GC_INTERVAL_MS
  );
  this._logGcTimer.unref();

  this.stdout.pipe(this._appLog, {end: false});
  this.stderr.pipe(this._appLog, {end: false});

  this._startOptions = {};
  this.setStartOptions({
    // --cluster=
    size: 'STRONGLOOP_CLUSTER' in process.env ?
      process.env.STRONGLOOP_CLUSTER : 'CPU',
    // --profile/--no-profile
    profile: true,
  });

  this.svcId = mandatory(options.serviceId);
  this.baseDir = mandatory(options.baseDir);
  this.server = mandatory(options.server);

  this.git = cicada(path.resolve(this.baseDir, 'svc', String(this.svcId)));
  this.git.container = this;

  // emits 'commit' on this.git after unpack
  this.tar = packReceiver(this.git);

  // emits 'prepared' on this when received
  this.local = localDeploy(this);

  this.git.on('commit', this.onCommit.bind(this));
}

util.inherits(Container, App);

Container.getLastContainers = function(options) {
  // FIXME return all the currently deployed service containers
  var svcBase = path.resolve(options.baseDir, 'svc');
  var containers = Object.create(null);
  try {
    var svcIds = fs.readdirSync(svcBase);
  } catch (er) {
    /* eslint */
    return containers;
  }

  svcIds.forEach(function(svcId) {
    options.serviceId = svcId;
    containers[svcId] = new Container(options);
  });

  return containers;
};

Container.prototype.setStartOptions = function(options) {
  //console.trace('SET START OPTIONS: %j', options);
  util._extend(this._startOptions, options);

  this.options.start = this.getStartCommand();
};

Container.prototype.getStartCommand = function() {
  var fmt = util.format;
  var cmd = fmt('sl-run --cluster=%s', this._startOptions.size);
  if (!this._startOptions.profile)
    cmd += ' --no-profile';
  return cmd;
};

Container.prototype.onCommit = function(commit) {
  commit.container = this;
  debug('receive git commit: %s', c2s(commit));

  // XXX(sam) bit of a mystery why this is necessary, and it breaks server
  // privacy, possibly because cicada was started before the rest of the app was
  // ready, maybe only in unit tests?
  if (!this.server._isStarted) return;

  // XXX(sam) will need to take the service (or instance?) ID
  commit.env = this.server.env(/* serviceId */);

  var self = this;

  prepare(commit, function(err) {
    if (!self._isStarted) return;

    debug('prepare done:', err);

    // XXX(sam) ... can I remove the commit?  not much else to do, would be
    // nice if git push could be failed, but I think its too late for that.
    if (err) return;

    self.emit('prepared', commit);
  });
};

Container.prototype.onDeployment = function(req, res) {
  var contentType = req.headers['content-type'];

  debug('deploy request: locked? %s method %j content-type %j',
        !!process.env.STRONG_PM_LOCKED, req.method, contentType);

  if (process.env.STRONG_PM_LOCKED) {
    debug('deploy rejected: locked');
    return rejectDeployments(req, res);
  }

  if (req.method === 'PUT') {
    debug('deploy accepted: npm package');
    return this.tar.handle(req, res);
  }

  if (contentType === 'application/x-pm-deploy') {
    debug('deploy accepted: local deploy');
    return this.local.handle(req, res);
  }

  debug('deploy accepted: git deploy');

  return this.git.handle(req, res);
};

function rejectDeployments(req, res) {
  res.status(403)
     .set('Content-Type', 'text/plain')
     .end('Forbidden: Server is not accepting deployments');
}

// This is a soft limit that is only checked/enforced once per LOG_GC interval.
exports.MAX_LOG_RETENTION_BYTES = 1 * 1024 * 1024;
exports.LOG_GC_INTERVAL_MS = 30 * 1000;

Container.prototype._gcLogs = function() {
  var overflow = this._appLog.length - exports.MAX_LOG_RETENTION_BYTES;
  if (overflow > 0) {
    this._appLog.consume(overflow);
  }
};

Container.prototype.readableLogSnapshot = function() {
  return this._appLog.duplicate();
};

Container.prototype.flushLogs = function() {
  this._appLog.consume(this._appLog.length);
};
