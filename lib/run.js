var EventEmitter = require('events').EventEmitter;
var assert = require('assert');
var async = require('async');
var child = require('child_process');
var childctl = require('strong-control-channel/process');
var debug = require('debug')('strong-pm');
var fs = require('fs');
var npmPath = require('npm-path');
var path = require('path');
var util = require('util');
var _ = require('lodash');

// Extend base without modifying it.
function extend(base, extra) {
  return util._extend(util._extend({}, base), extra);
}

function Runner(commit)  {
  this.commit = commit;
  this.child = null;
  this.status = null;
  this.nextCommit = null;
  this.stopped = null;
  this.PWD = null;
  this.restartCount = 0;
}

util.inherits(Runner, EventEmitter);

Runner.prototype.start = function start() {
  console.log('Start %s', this);

  if (this.child) return null;

  this.stopped = false;

  var commit = this.commit;
  var cmd = commit.config.start[0];

  if (cmd == null || cmd.length < 1) {
    cmd = 'sl-run';
  }

  // set PWD in env (as shell does) to the working directory, and add our
  // dependencies .bin folder to our path, so our sl-run will be found.
  var PWD = path.resolve(commit.dir, '..', 'current');
  commit.env.PWD = PWD;
  // set $PATH (or %Path%) to include node and any dependencies bins
  commit.env[npmPath.PATH] = npmPath.get({
    env: commit.env,
    cwd: path.resolve(__dirname, '..'),
  });
  this.PWD = PWD;
  this._linkPwd();

  debug('start with command `%s` env %j', cmd, commit.env);

  this.child = commit.spawn(cmd, {
    // cwd: commit.spawn sets this to working directory for commit
    env: commit.env,
    stdio: [0, 1, 2, 'ipc'],
  });
  assert(this.child.send, 'child cannot send');
  this.ctl = childctl.attach(this.onRequest.bind(this), this.child);

  this.child.runner = this;
  this.child.on('error', function(err) {
    console.error('Fail to spawn `%s` in `%s`: %s', cmd, commit.dir, err);
    // Mostly, this will fail because cmd wasn't found in PATH, but it could
    // also fail because of insufficient mem, permissions, etc. Pass failure
    // up by faking a 127 exit status for this, similar to /bin/sh.
    this.runner.onExit(127);
  });

  this.child.on('exit', this.onExit.bind(this));

  return this;
}

Runner.prototype.onRequest = function onRequest(req, callback) {
  console.log('Receive request %j by %s', req, this);
  this.emit('request', req, callback);
};

Runner.prototype.request = function request(req, callback) {
  console.log('Request %j of %s', req, this);
  return this.ctl.request(req, callback);
};

Runner.prototype._linkPwd = function _linkPwd() {
  assert(this.PWD);

  // Symlink will fail if the link already exists, so remove last link.
  try {
    fs.unlinkSync(this.PWD);
  } catch(er) {
    // File didn't exist.
  }
  // XXX(sam) catch errors here? this is unexpected... can't do much but log
  // and keep going
  fs.symlinkSync(path.basename(this.commit.dir), this.PWD);
};

Runner.prototype.onExit = function onExit(code, signal) {
  var status = signal || code;

  debug('Exit of %s with status %s stopped? %s', this, status, this.stopped);

  this.child = null;
  this.emit('exit', status);
  this._restart(status);
};

// Callback with exit status if killed, with nothing if already dead.
Runner.prototype.kill = function kill(callback) {
  if (!callback) {
    callback = function() {};
  }

  if (!this.child) {
    process.nextTick(callback);
    return this;
  }

  var signame = this.commit.config.stop[0];

  if (!process.binding('constants')[signame]) {
    var sigdef = 'SIGTERM';
    console.error('Invalid stop signal: %s, using default %s', signame, sigdef);
    signame = sigdef;
  }

  debug('Kill process %s with %s', this.child.pid, signame);

  try {
    this.child.kill(signame);
    this.child.once('exit', function(code, signal) {
      callback(signal || code);
    });
  } catch(err) {
    if (err.code == 'ESRCH') {
      // We got unlucky, the process is dead
      process.nextTick(callback);
      return;
    }
    console.error('Stop process %d with %s failed: %s',
      this.child.pid, signame, err);
  }
  return this;
};

Runner.prototype.stop = function stop(callback) {
  console.log('Stop %s', this);

  var self = this;
  self.stopped = true;
  self.kill(function(status) {
    //self.stopped = false; // XXX(sam) can be removed? retry tests
    callback(status);
  });
};

Runner.prototype.softStop = function softStop(callback) {
  console.log('Soft stop %s', this);

  var self = this;
  self.stopped = true;
  self.request({cmd: 'stop'}, function(rsp) {
    debug('stop response: %j', rsp);
  });
  self.once('exit', function(status) {
    return callback(status);
  });
  return this;
};

Runner.prototype.toString = function toString() {
  function c2s(c) {
    if (!c) return '(none)';

    return util.format('%s/%s in %s', c.repo, c.branch, c.dir);
  }

  var s = 'Runner:';

  if (this.child) {
    s += util.format(' child %s', this.child.pid);
  }
  if (this.stopped) {
    s += ' (stopping)';
  }
  if (this.commit) {
    s += util.format(' commit %s', c2s(this.commit));
  }
  if (this.nextCommit) {
    s += util.format(' next %s', c2s(this.nextCommit));
  }
  return s;
};

// Replace currently running commit with next commit. Use replace signal if it
// is valid, otherwise do a restart.
Runner.prototype.replace = function replace(next) {
  var signame = this.commit.config.replace[0];

  if (!process.binding('constants')[signame]) {
    // Kill and let it restart will always work.
    console.error('Invalid replace signal: %s, doing a restart', signame);
    this.nextCommit = next;
    this.kill();
    return this;
  }

  if (envChanged(this.commit.env, next.env)) {
    console.log('ENV has changed, restarting');
    this.nextCommit = next;
    this.kill();
    return this;
  }

  this.commit = next;
  this._linkPwd();
  try {
    this.child.kill(signame);
  } catch(err) {
    if (err.code == 'ESRCH') {
      // Child died as we were trying to replace it... let normal restart on
      // failure handle this.
      return;
    }
    console.error('Restart process %d with %s failed: %s',
      this.child.pid, signame, err);
    // XXX if we can't signal our children, not sure what we can do
  }

  return this;
};

function envChanged(a, b) {
  return !_.isEqual(
    _.omit(a, 'PATH', 'PWD', 'CWD'),
    _.omit(b, 'PATH', 'PWD', 'CWD')
  );
}

Runner.prototype._restart = function _restart(status) {
  debug('_restart %s', this);

  if (this.stopped) return;

  if (this.nextCommit) {
    this.commit = this.nextCommit;
    this.nextCommit = null;
    console.log('Restarting next commit %s', this);
    this.restartCount = 0;
    this.start();
    return;
  }

  // The runner should not exit unless we stopped it so a next version of the
  // app could be run, something has gone wrong!
  console.log('Unexpected exit with %s from %s', status, this);
  this.restartCount += 1;

  // Throttle the restart
  setTimeout(this.start.bind(this), 1000);
};

module.exports = exports = new EventEmitter();

var current;

// Run a commit, replacing the currently running commit, if it exists.
exports.run = function run(commit) {
  console.log('Run request for commit %j on current %s', commit, current);

  if (current) {
    current.replace(commit);
    return current;
  }

  current = new Runner(commit);
  current.start();

  current.on('request', function(req, callback) {
    exports.emit('request', req, callback);
  });

  return current;
};

// Stop the current commit, if it exists.
exports.stop = function(callback) {
  console.log('Stop current %s', current || '(none)');

  if (!callback)
    callback = function() {};

  if (!current) {
    process.nextTick(callback);
    return null;
  }

  current.stop(function() {
    current = null;
    return callback();
  });

  return current;
};

// Return the current runner, or null if there is none.
exports.current = function() {
  return current;
};
