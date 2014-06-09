var EventEmitter = require('events').EventEmitter;
var assert = require('assert');
var async = require('async');
var child = require('child_process');
var debug = require('debug')('strong-deploy');
var path = require('path');
var util = require('util');

function Runner(commit)  {
  this.commit = commit;
  this.child = null;
  this.status = null;
}

util.inherits(Runner, EventEmitter);

Runner.prototype.start = function start() {
  if (this.child) return this;

  this.child = child.spawn('sl-run', [this.commit.dir], {
    // cwd: commit.spawn sets to working directory for commit
    env: process.env,
    stdio: 'inherit',
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
  this.child.kill('SIGTERM');
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

// If there is a next, start that one in place of the now-exited last. If not,
// just restart the last.
function restart(status) {
  debug('restart with status %s', status);
  debug('restart last %s', last);
  debug('restart next %s', next);

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
exports.run = function appRun(commit) {
  debug('run request for commit %j', commit);

  next = new Runner(commit);
  next.on('exit', restart);

  if (last) {
    debug('run stopping last %s', last);
    last.stop();
    return;
  }
  // else, fake exit of last

  restart();
};

// XXX on SIGTERM? how does nodemon restart?
process.on('exit', function() {
  if (last) {
    console.log('On exit: stopping last %s', last);
    last.stop();
  }
});
