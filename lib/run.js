var EventEmitter = require('events').EventEmitter;
var assert = require('assert');
var async = require('async');
var child = require('child_process');
var debug = require('debug')('strong-deploy');
var path = require('path');
var util = require('util');

// Extend base without modifying it.
function extend(base, extra) {
  return util._extend(util._extend({}, base), extra);
}

function Runner(commit)  {
  this.commit = commit;
  this.child = null;
  this.status = null;
}

util.inherits(Runner, EventEmitter);

Runner.prototype.start = function start() {
  if (this.child) return this;

  var commit = this.commit;
  var cmd = commit.config.start[0];

  if (cmd == null || cmd.length < 1) {
    cmd = 'sl-run';
  }

  // set PWD in env (as shell does) to the working directory, and add our
  // dependencies .bin folder to our path, so our sl-run will be found.
  var bindir = path.resolve(module.filename, '../../node_modules/.bin');
  var PATH = process.env.PATH || ''; // No PATH is pathological, but possible.
  var env = {
    PWD: commit.dir,
    PATH: bindir + path.delimiter + PATH,
  };
  debug('start with command `%s` env %j', cmd, env);

  this.child = commit.spawn(cmd, {
    // cwd: commit.spawn sets to working directory for commit
    env: extend(process.env, env),
    stdio: 'inherit',
  });

  this.child.commit = this;
  this.child.on('error', function(err) {
    console.error('Fail to spawn `%s` in `%s`: %s', cmd, commit.dir, err);
    // Mostly, this will fail because cmd wasn't found in PATH, but it could
    // also fail because of insufficient mem, permissions, etc. Pass failure
    // up by faking a 127 exit status for this, similar to /bin/sh.
    this.commit.onExit(127);
  });

  this.child.on('exit', this.onExit.bind(this))

  return this;
}

Runner.prototype.onExit = function onExit(code, signal) {
  this.child = null;
  this.emit('exit', signal || code);
};

Runner.prototype.stop = function stop() {
  if (!this.child) return this;

  var signame = this.commit.config.stop[0];

  if (!process.binding('constants')[signame]) {
    console.error('Invalid stop signal: %s, using default SIGTERM', signame);
    signame = 'SIGTERM';
  }

  debug('Stop process %s with %s', this.child.pid, signame);

  try {
    this.child.kill(signame);
  } catch(err) {
    if (err.code == 'ESRCH') {
      // We got unlucky, the process is dead
      return;
    }
    console.error('Stop process %d with %s failed: %s',
      this.child.pid, signame, err);
  }
  return this;
};

Runner.prototype.toString = function toString() {
  return util.format('Runner: child %s git %s/%s in %s',
    this.child ? this.child.pid : '(none)',
    this.commit.repo,
    this.commit.branch,
    this.commit.dir
  );
};


// Last and next runs.
var last;
var next;
var stop = false;

// If there is a next, start that one in place of the now-exited last. If not,
// just restart the last.
function restart(status) {
  debug('restart with status %s stop? %s', status, stop);
  debug('restart last %s', last);
  debug('restart next %s', next);

  if (stop) {
    console.log('Externally applied stop');
    last = null;
    next = null;
    stop = false;
    return;
  }

  assert(!(last && last.child));

  if (next) {
    last = next;
    next = null;
    last.start();
    console.log('Started %s', last);
    return;
  }

  // The runner should not exit unless we stopped it so a next version of the
  // app could be run, something has gone wrong!
  console.log('Unexpected exit by %s from %s', status, last);

  // XXX throttle the restart, perhaps a fixed delay?
  assert(last);

  setTimeout(function() {
    last.start();

    console.log('Started %s', last);
  }, 1000);
}

// Run a cicada commit
exports.run = function run(commit) {
  debug('run request for commit %j', commit);

  next = new Runner(commit);
  next.on('exit', restart);

  if (last) {
    debug('run stopping last %s', last);
    last.stop();
    return next;
  }
  // else, fake exit of last

  restart();

  return last; // after restart, next became last
};

exports.stop = function () {
  if (last) {
    stop = true;
    last.stop();
  }
};
