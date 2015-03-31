var app = require('./helper');
var assert = require('assert');
var async = require('async');
var c2s = require('strong-runner').Runnable.toString;
var debug = require('debug')('strong-pm:test');
var fs = require('fs');
var path = require('path');
var util = require('util');

var server = app.listen();
var run = server._container;

// Remove default commit listener. Test provides custom implementation
server.removeAllListeners('commit');

function running() {
  var current = run.current;
  return current ? current.child : null;
}

function pushWithConfig(_, callback) {
  debug('PUSH config %j', server._startOptions);

  config = app.configForCommit({});

  var repo = app.push();

  server.once('commit', function(commit) {
    debug('on commit:', c2s(commit));
    assert.equal(commit.repo, repo);

    commit.config = config;
    commit.env = server.env(process.env);

    commit.appPid = function() {
      var appFile = path.join(this.dir, 'app.pid');
      try {
        var pid = +fs.readFileSync(appFile, 'utf-8');
        debug('app pid from %s is %j', c2s(this), pid);
        return pid;
      } catch(er) {
        // No app.pid
      }
    };

    app.prepare(commit, function(err) {
      debug('on prepare: %j', err || 'success');
      if (err) {
        return callback(err);
      }

      function poll() {
        // Should poll to ensure app's http port is reachable... but we don't
        // know what port its running on, and don't have its stdio output!
        // XXX(sam) we will know its port soon, fix this then
        var appPid = commit.appPid();
        if (running() && appPid) {
          debug('on timeout, app pid: %j', appPid);
          debug('PUSH: done');
          return callback(null, commit);
        }
        setTimeout(poll, 20);
      }

      poll();

      server.emit('prepared', commit);
    });

  });
}

// Set configuration
var CONFIG; // XXX(sam) remove after tests pass

function replace(yes) {
  // early pm worked with supervisors that did not implement replace on SIGHUP,
  // but we only use strong-supervisor, now, and it always supports replace
  assert(yes, 'replace is no longer optional');
  return function replace(callback) {
    callback();
  };
}

function cluster(yes) {
  return yes ?  function clustered(callback) {
    server.setStartOptions({size: 1, profile: false});
    return callback();
  } : function unclustered(callback) {
    server.setStartOptions({size: 'off', profile: false});
    return callback();
  };
}

function start(callback) {
  debug('... START');
  debug('config %j', server._startOptions);
  assert(!running());
  pushWithConfig(CONFIG, function() {
    assert(running());
    debug('... START: done');
    callback();
  });
}

function push(callback) {
  debug('...');
  debug('... PUSH');
  pushWithConfig(CONFIG, function() {
    assert(running());
  debug('... PUSH: done');
    callback();
  });
}

function stopCurrent(callback) {
  debug('...');
  debug('... STOP CURRENT');
  run.current.stop(function(reason) {
    debug('... STOP CURRENT: stopped with reason %j', reason);
    return callback();
  });
}

function repush(callback) {
  debug('...');
  debug('... REPUSH');
  debug('config %j', server._startOptions);
  assert(running());
  var lastPid = running().pid;
  var lastCommit = running().runner.commit;
  var size = server._startOptions.size;
  var replaceable = /CPU/.test(size) || size >= 1;
  debug('lastPid %d lastCommit %s replaceable? %j',
        lastPid, c2s(lastCommit), replaceable);
  pushWithConfig(CONFIG, function(err, commit) {
    assert(running());
    // If replaceable, then superisor should be same process, if not, supervisor
    // should have been restarted.
    debug('pid %d lastPid %d size %j', running().pid, lastPid, size);
    if (replaceable) {
      assert.equal(running().pid, lastPid, 'supervisor should be same pid');
    } else {
      assert.notEqual(running().pid, lastPid);
    }

    // Whether we replaced or not, there should be a worker running in the
    // new commit, check it's pid is not the same as that of the last commit's
    // worker.
    assert(lastCommit.appPid());
    assert(commit.appPid());
    assert.notEqual(lastCommit.appPid(), commit.appPid(),
                    'worker should be new');
    debug('... REPUSH: done');
    callback();
  });
}

function stop(callback) {
  debug('...');
  debug('... STOP');
  assert(running());
  app.stop(callback, function() {
    assert(!running());
    debug('... STOP: done');
    callback();
  });
}

function kill(callback) {
  debug('...');
  debug('... KILL');
  assert(running());

  var child = run.current.child;

  // Wait a second and assert that it was restarted after unexpected death
  child.on('exit', function() {
    setTimeout(function() {
      assert(running());
      debug('... KILL: done');
      callback();
    }, 1000);
  });

  child.kill();
}

function test(/* steps... */) {
  var steps = Array.prototype.slice.call(arguments);
  var description = steps.map(function(step) { return step.name; }).join(', ');

  return function(callback) {
    debug('...');
    debug('...');
    debug('...');
    debug('TEST: %s', description);

    async.series(steps, function(err) {
      assert.ifError(err, description);
      debug('TEST OK: %s', description);
      return callback();
    });
  };
}

server.once('listening', function() {
  var T = true, F = true;
  // XXX(sam) test used to run supervisor in unclustered mode, and without
  // replace, but these are no longer valid options, by setting F to true, we
  // remove the invalid cases, and increase coverage over move valid ones. Note
  // that some of the comments below are no longer valid
  // XXX(sam) this entire test should be moved into strong-runner

  async.series([
    test(cluster(T), replace(T), start, stopCurrent, push, stop),

    // no clustering, replace set, but SIHUP will just kill supervisor
    test(cluster(F), replace(T), start, stop),
    test(cluster(F), replace(T), start, repush, stop),
    test(cluster(F), replace(T), start, repush, repush, stop),
    test(cluster(F), replace(T), start, kill, stop),
    test(cluster(F), replace(T), start, kill, repush, stop),
    test(cluster(T), replace(T), start, repush, kill, repush, stop),

    // cluster, replace, supervisor will be SIGHUPed and workers will restart
    test(cluster(T), replace(T), start, repush, stop),
    test(cluster(T), replace(T), start, repush, repush, stop),
  ], function() {
    debug('done tests, stop pm');
    app.ok = true;
    server.stop();
  });
});
