var app = require('./helper');
var assert = require('assert');
var async = require('async');
var path = require('path');
var run = require('../lib/run');
var util = require('util');

var server = app.listen();

function running() {
  var current = run.current();
  return current ? current.child : null;
}

function pushWithConfig(config, callback) {
  console.log('PUSH config %j', config);

  config = util._extend(app.configForCommit('', {}), config);

  var repo = app.push();

  server.once('commit', function(commit) {
    console.log('on commit:', commit);
    assert.equal(commit.repo, repo);

    commit.config = config;

    app.prepare(commit, function(err) {
      console.log('on prepare:', err || 'success');
      if (err) {
        return callback(err);
      }

      setTimeout(function() {
        // Should poll to ensure app's http port is reachable... but we don't
        // know what port its running on, and don't have its stdio output!
        console.log('on timeout, app running');
        assert(running());
        return callback(null, commit);
      }, 1000);

      app.run(commit);
    });

  });
}

function start(callback) {
  console.log('... START');
  assert(!running());
  pushWithConfig({}, function() {
    assert(running());
    callback();
  });
}

function restart(callback) {
  console.log('... RESTART');
  assert(running());
  var lastPid = running().pid;
  pushWithConfig({}, function() {
    assert(running());
    assert.notEqual(running().pid, lastPid);
    callback();
  });
}

function stop(callback) {
  console.log('... STOP');
  assert(running());
  app.stop(callback, function() {
    assert(!running());
    callback();
  });
}

function kill(callback) {
  console.log('... KILL');
  assert(running());

  var child = run.current().child;

  // Wait a second an assert that it is running
  child.on('exit', function() {
    setTimeout(function() {
      assert(running());
      callback();
    }, 1000);
  });

  child.kill();
}

function test(/* steps... */) {
  var steps = Array.prototype.slice.call(arguments);
  var description = steps.map(function(step) { return step.name; }).join(', ');

  return function(callback) {
    console.log('TEST: %s:', description, steps);

    async.series(steps, function(err) {
      assert.ifError(err);
      return callback();
    });
  };
}

server.once('listening', function() {

  async.series([
    test(start, stop),
    test(start, restart, stop),
    test(start, restart, restart, stop),
    test(start, kill, stop),
    test(start, kill, restart, stop),
  ], function() {
    app.ok = true;
    server.close();
    console.log('PASS');
  });
});
