'use strict';

var App = require('strong-runner').App;
var assert = require('assert');
var bl = require('bl');
var c2s = require('strong-runner').Runnable.toString;
var cicada = require('strong-fork-cicada');
var debug = require('debug')('strong-pm:receive');
var localDeploy = require('./local-deploy');
var packReceiver = require('./pack-receiver');
var path = require('path');
var util = require('util');

function mandatory(value) {
  assert(value);
  return value;
}

// XXX(sam) commit needs to have toString set to Runnable.c2s

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

  this._startOptions = {
    // --cluster=
    size: 'STRONGLOOP_CLUSTER' in process.env ?
      process.env.STRONGLOOP_CLUSTER : 'CPU',
    // --profile/--no-profile
    profile: true,
  };
  this.setStartOptions();

  this.svcId = mandatory(options.serviceId);
  this.baseDir = mandatory(options.baseDir);
  this.server = mandatory(options.server);

  this.git = cicada(path.resolve(this.baseDir, String(this.svcId)));
  this.tar = packReceiver(this.git);
  this.local = localDeploy(this);
  this.git.container = this;

  this.git.on('commit', this.onCommit.bind(this));
}

util.inherits(Container, App);

Container.getLastContainers = function(baseDir) {
  // FIXME ... either list them, or take options, and return all
  // the containers... that would probably be best, actually.
  baseDir = baseDir;
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

Container.prototype.onCommit = function(commit) {
  commit.container = this;
  debug('receive git commit: %s', c2s(commit));
  // XXX(sam) Just call directly on container/driver? do we need to bounce
  // this through server? I think not... the prepare should also be driven
  // from here... its a concern of the container whether preparation is even
  // possible/necessary.
  this.server.emit('commit', commit, this);
};

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
