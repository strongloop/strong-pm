'use strict';

var App = require('strong-runner').App;
var Debug = require('debug');
var assert = require('assert');
var bl = require('bl');
var c2s = require('strong-runner').Runnable.toString;
var cicada = require('strong-fork-cicada');
var cicadaCommit = require('strong-fork-cicada/lib/commit');
var fs = require('fs');
var localDeploy = require('./local-deploy');
var mandatory = require('./util').mandatory;
var packReceiver = require('./pack-receiver');
var path = require('path');
var prepare = require('./prepare').prepare;
var util = require('util');

assert(assert); // For lint

// XXX(sam) commit needs to have toString set to Runnable.c2s

// FIXME we must, at minimum, check that the commit has a top-level
// package.json, if it doesn't, the npm commands will search upwards and cause a
// npm rebuild and npm install --production of strong-pm itself!

module.exports = exports = Container;

function Container(options) {
  if (!(this instanceof Container))
    return new Container(options);

  App.call(this, options);

  this.svcId = mandatory(options.svcId);
  this.baseDir = mandatory(options.baseDir);
  this.server = mandatory(options.server);

  this.debug = Debug('strong-pm:container:' + this.svcId);

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
    // --trace
    trace: false,
  });

  // XXX(sam) might be able to use a single cicada, made in the driver, and
  // using the repo set to the svcId, but this works fine.
  this.git = cicada(path.resolve(this.baseDir, 'svc', String(this.svcId)));
  this.git.container = this;

  // emits 'commit' on this.git after unpack
  this.tar = packReceiver(this.git);

  // emits 'prepared' on this when received
  this.local = localDeploy(this);

  this.git.on('commit', this._onCommit.bind(this));

  // Happens after a new-deploy is prepared, and also when a previously prepared
  // service is found at startup.
  this.on('prepared', this._onPrepared);
}

util.inherits(Container, App);

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
  if (this._startOptions.trace)
    cmd += ' --trace';
  return cmd;
};

Container.prototype.runCurrent = function(callback) {
  var self = this;
  var currentSymlink = self.git.workdir({id: 'current'});
  self.debug('run current deployment %j', currentSymlink);
  fs.readlink(currentSymlink, function(err, id) {
    if (err) {
      self.debug('no current deployment found');
      return callback();
    }

    // If we find it, it was already prepared (and run) in the past, so emit
    // it as 'prepared', after figuring out the commit metadata.
    var dir = self.git.workdir({id: id});
    var hash = id.split('.')[0];
    var commit = cicadaCommit({hash: hash, id: id, dir: dir});
    commit.env = self.server.env(self.svcId);
    commit.container = self;

    self.emit('prepared', commit);

    process.nextTick(callback);
  });
};

Container.prototype.onDeployment = function(req, res) {
  var contentType = req.headers['content-type'];

  this.debug('deploy request: locked? %s method %j content-type %j',
        !!process.env.STRONG_PM_LOCKED, req.method, contentType);

  if (process.env.STRONG_PM_LOCKED) {
    this.debug('deploy rejected: locked');
    return rejectDeployments(req, res);
  }

  if (req.method === 'PUT') {
    this.debug('deploy accepted: npm package');
    return this.tar.handle(req, res);
  }

  if (contentType === 'application/x-pm-deploy') {
    this.debug('deploy accepted: local deploy');
    return this.local.handle(req, res);
  }

  this.debug('deploy accepted: git deploy');

  return this.git.handle(req, res);
};

function rejectDeployments(req, res) {
  res.status(403)
     .set('Content-Type', 'text/plain')
     .end('Forbidden: Server is not accepting deployments');
}

Container.prototype._onCommit = function(commit) {
  var self = this;

  commit.container = self;

  self.debug('onCommit deployed: %s', c2s(commit));

  // XXX(sam) bit of a mystery why this is necessary, and it breaks server
  // privacy, possibly because cicada was started before the rest of the app was
  // ready, or maybe only in unit tests?
  if (!self.server._isStarted) return;

  // XXX(sam) will need to take the service (or instance?) ID
  commit.env = self.server.env(/* svcId */);

  self.debug('onCommit preparing: %s', c2s(commit));

  prepare(commit, function(err) {
    if (!self.server._isStarted) return;

    self.debug('onCommit prepared, err? %s', err);

    // XXX(sam) ... can I remove the commit?  not much else to do, would be
    // nice if git push could be failed, but I think its too late for that.
    if (err) return;

    self.emit('prepared', commit);
  });
};

Container.prototype._onPrepared = function(commit) {
  if (!this.server._isStarted) return;

  this.debug('on prepared: %s', c2s(commit));
  this.run(commit);
};

Container.prototype.updateEnv = function(env) {
  var self = this;
  var current = self.current;
  if (current) {
    // Make copy of current app but with an updated environment.
    // XXX(sam) commit creation should be in a common function.
    var commit = cicadaCommit(current.commit);
    commit.env = env;
    commit.svcId = this.svcId;
    commit.container = self;
    self.debug('restarting with new env');
    self.emit('commit', commit);
  } else {
    self.debug('no current to restart with new env');
  }
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
