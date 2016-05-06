// Copyright IBM Corp. 2015,2016. All Rights Reserved.
// Node module: strong-pm
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

var App = require('strong-runner').App;
var Debug = require('debug');
var _ = require('lodash');
var assert = require('assert');
var c2s = require('strong-runner').Runnable.toString;
var cicada = require('strong-fork-cicada');
var cicadaCommit = require('strong-fork-cicada/lib/commit');
var fs = require('fs');
var localDeploy = require('../common/local-deploy');
var logBuffer = require('../common/log-buffer');
var mandatory = require('./../../util').mandatory;
var packReceiver = require('../common/pack-receiver');
var path = require('path');
var prepare = require('../common/prepare').prepare;
var rmrf = require('rimraf');
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

  // XXX(sam) cicada, packReceiver, localDeploy, prepare: should be injectable

  this.instanceId = mandatory(options.instanceId);
  this.baseDir = mandatory(options.baseDir);
  this.server = mandatory(options.server);

  this.debug = Debug('strong-pm:direct:container:' + this.instanceId);

  // this.restartCount = 0; // XXX(sam) move here from strong-runner.App?
  this._appLog = logBuffer();
  this._appLog.enableGC();

  this.stdout.pipe(this._appLog, {end: false});
  this.stdout.pipe(process.stdout, {end: false});
  this.stderr.pipe(this._appLog, {end: false});
  this.stderr.pipe(process.stderr, {end: false});

  this._startOptions = {};
  this.setStartOptions({
    // --cluster=
    size: 'STRONGLOOP_CLUSTER' in process.env ?
      process.env.STRONGLOOP_CLUSTER : 'CPU',
    // --profile/--no-profile
    profile: true,
    // --trace
    trace: false,
    // --control
    control: options.control,
  });

  this.ports = [];

  // XXX(sam) might be able to use a single cicada, made in the driver, and
  // using the repo set to the svcId, but this works fine.
  this._svcDir = path.resolve(this.baseDir, 'svc', String(this.instanceId));
  this.git = cicada(this._svcDir);
  this.git.container = this;

  // emits 'commit' on this.git after unpack
  this.tar = packReceiver(this.git);

  // emits 'prepared' on this when received
  this.local = localDeploy(this);

  this.git.on('commit', this._onCommit.bind(this));
  this.on('commit', this._onCommit.bind(this));

  // Happens after a new-deploy is prepared, and also when a previously prepared
  // service is found at startup.
  this.on('prepared', this._onPrepared);

  var self = this;
  this.on('request', function(req) {
    var supervisorPid;
    if (req.cmd === 'started') {
      supervisorPid = req.pid;
      self.current.once('exit', function(status) {
        self.emit('request', {
          cmd: 'exit',
          id: 0,
          pid: supervisorPid,
          reason: status,
          pst: req.pst,
        });
      });
    }
  });
}

util.inherits(Container, App);

Container.prototype.setStartOptions = function(options) {
  var self = this;
  var original = _.clone(this._startOptions);

  this._startOptions = _.merge(this._startOptions, options);
  this.options.start = this.getStartCommand();
  if (this.current)
    this.current.options.start = this.options.start;
  this.debug('setStartOptions: %j, cmd %s', options, this.options.start);

  if (options.size != null && options.size !== original.size) {
    self.debug('set-size: %j', options.size);
    this.request({cmd: 'set-size', size: options.size}, function(rsp) {
      self.debug('set-size %j: rsp %j', options.size, rsp);
    });
  }

  if (options.trace != null && options.trace !== original.trace) {
    self.debug('set tracing: %j', options.trace);
    this.request({cmd: 'tracing', enabled: options.trace}, function(rsp) {
      self.debug('tracing %j: rsp %j', options.trace, rsp);
    });
  }
};

Container.prototype.getStartCommand = function() {
  var fmt = util.format;
  var cmd = fmt('sl-run --cluster=%s', this._startOptions.size);
  if (!this._startOptions.profile)
    cmd += ' --no-profile';
  if (this._startOptions.trace)
    cmd += ' --trace';
  if (this._startOptions.control)
    cmd += fmt(' --control=%s', this._startOptions.control);
  return cmd;
};

Container.prototype.remove = function(callback) {
  var self = this;

  self.debug('removing %j %j', self.instanceId, self._svcDir);

  rmrf(self._svcDir, function(err) {
    self.debug('removed %j %j: err? %j', self.instanceId, self._svcDir, err);
    assert.ifError(err);
    return callback();
  });
};

Container.prototype.runCurrent = function(callback) {
  var self = this;
  var currentSymlink = self.git.workdir({id: 'current'});
  self.debug('run current deployment %j', currentSymlink);
  fs.readlink(currentSymlink, function(err, dir) {
    if (err) {
      self.debug('no current deployment found');
      return callback();
    }

    // The current symlink is now absolute, but it used to be relative prior to
    // strong-runner 5.x, so can still exist on disk as relative, both previous
    // strong-pm installs, as well as in the unit test fixtures. Resolve it to
    // absolute in case it isn't already.
    dir = path.resolve(currentSymlink, '..', dir);

    // If we find it, it was already prepared (and run) in the past, so emit
    // it as 'prepared', after figuring out the commit metadata.
    var id = path.basename(dir);
    var hash = id.split('.')[0];
    var commit = cicadaCommit({
      dir: dir,
      hash: hash,
      id: id,
      repo: self.instanceId,
      branch: 'default', // XXX(sam) should stop logging branch, its meaningless
    });
    self.server.getInstanceEnv(self.instanceId, function(err, env) {
      if (err) return callback(err);
      commit.env = env;
      commit.container = self;

      self.emit('prepared', commit);
      callback();
    });

  });
};

Container.prototype.deployInstance = function(req, res) {
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

  self.server.getInstanceEnv(self.instanceId, function(err, env) {
    self.debug('onCommit prepared, getInstanceEnv err? %s', err);

    // XXX(sam) ... can I remove the commit?  not much else to do, would be
    // nice if git push could be failed, but I think its too late for that.
    if (err) return;

    commit.env = env;

    self.debug('onCommit preparing: %s', c2s(commit));

    prepare(commit, function(err) {
      if (!self.server._isStarted) return;

      self.debug('onCommit prepared, err? %s', err);

      // XXX(sam) ... can I remove the commit?  not much else to do, would be
      // nice if git push could be failed, but I think its too late for that.
      if (err) {
        console.log('Prepare failed on %j in %j: %s', err.cmd, err.dir, err);
        return;
      }

      self.emit('prepared', commit);
    });
  });
};

Container.prototype._onPrepared = function(commit) {
  var self = this;

  // _isStarted should be a driver property, related to it's start/stop methods
  if (!self.server._isStarted) return;

  self.debug('on prepared: %s', c2s(commit));

  if (!commit.env) {
    self.server.getInstanceEnv(self.instanceId, function(err, env) {
      assert.ifError(err);
      commit.env = env;
      run();
    });
  } else {
    setImmediate(run);
  }

  function run() {
    // reset listening ports
    self.ports = [];
    self.run(commit);
  }
};

function envChanged(a, b) {
  return !_.isEqual(
    _.omit(a, 'PATH', 'PWD', 'CWD'),
    _.omit(b, 'PATH', 'PWD', 'CWD')
  );
}

Container.prototype.updateInstanceEnv = function(env, callback) {
  var self = this;
  var current = self.current;

  self.debug('updateInstanceEnv: %j', env);

  setImmediate(callback);

  if (!current)
    return self.debug('no current to restart with new env');

  if (!envChanged(current.commit.env, env))
    return self.debug('no change in env to restart with');

  self.debug('restarting with new env: %j', env);

  // Make copy of current app but with an updated environment.
  // XXX(sam) commit creation should be in a common function.
  var commit = cicadaCommit(current.commit);
  commit.env = env;
  commit.instanceId = this.instanceId;
  commit.container = self;

  self.emit('prepared', commit);
};

Container.prototype.dumpLogs = function() {
  if (this.current) {
    return this._appLog.dump();
  } else {
    return null;
  }

};
