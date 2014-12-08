var app = require('./helper');
var assert = require('assert');
var async = require('async');
var fs = require('fs');
var path = require('path');
var run = require('../lib/run');
var util = require('util');

var server = app.listen();

// Remove default commit listener. Test provides custom implementation
server.removeAllListeners('commit');

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
    commit.env = server.env(process.env);

    commit.appPid = function() {
      var appFile = path.join(this.dir, 'app.pid');
      try {
        return +fs.readFileSync(appFile, 'utf-8');
      } catch(er) {
        // No app.pid
      }
    };

    app.prepare(commit, function(err) {
      console.log('on prepare:', err || 'success');
      if (err) {
        return callback(err);
      }

      function poll() {
        // Should poll to ensure app's http port is reachable... but we don't
        // know what port its running on, and don't have its stdio output!
        // XXX(sam) we will know its port soon, fix this then
        var appPid = commit.appPid();
        if (running() && appPid) {
          console.log('on timeout, app pid:', appPid);
          return callback(null, commit);
        }
        setTimeout(poll, 20);
      }

      poll();

      server.emit('prepared', commit);
    });

  });
}

var CONFIG = {
  replace:['no']
};

// Set configuration
function replace(yes) {
  return yes ?  function useReplace(callback) {
    CONFIG.replace = ['SIGHUP'];
    return callback();
  } : function useRestart(callback) {
    CONFIG.replace = ['no'];
    return callback();
  };
}

function cluster(yes) {
  return yes ?  function clustered(callback) {
    CONFIG.start = ['sl-run --cluster=1 --no-profile'];
    return callback();
  } : function unclustered(callback) {
    CONFIG.start = ['sl-run --cluster=off --no-profile'];
    return callback();
  };
}

function start(callback) {
  console.log('... START');
  assert(!running());
  pushWithConfig(CONFIG, function() {
    assert(running());
    callback();
  });
}

function push(callback) {
  pushWithConfig(CONFIG, function() {
    assert(running());
    callback();
  });
}

function stopCurrent(callback) {
  console.log('... STOP CURRENT');
  run.current().stop(function(reason) {
    console.log('stopped with reason %j', reason);
    return callback();
  });
}

function repush(callback) {
  console.log('... RESTART');
  assert(running());
  var lastPid = running().pid;
  var lastCommit = running().runner.commit;
  var replaceable = lastCommit.config.replace[0] === 'SIGHUP' &&
    /--cluster=1/.test(lastCommit.config.start[0]);
  pushWithConfig(CONFIG, function(err, commit) {
    assert(running());
    // If replaceable, then superisor should be same process, if not, supervisor
    // should have been restarted.
    if (replaceable) {
      assert.equal(running().pid, lastPid);
    } else {
      assert.notEqual(running().pid, lastPid);
    }

    // Whether we replaced or not, there should be a worker running in the
    // new commit, check it's pid is not the same as that of the last commit's
    // worker.
    assert(lastCommit.appPid());
    assert(commit.appPid());
    assert.notEqual(lastCommit.appPid(), commit.appPid());
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

  // Wait a second and assert that it was restarted after unexpected death
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
    console.log('TEST: %s:', description);

    async.series(steps, function(err) {
      assert.ifError(err);
      return callback();
    });
  };
}

server.once('listening', function() {
  var T = true, F = false;

  async.series([
    test(cluster(T), replace(T), start, stopCurrent, push, stop),

    // no clustering, no replace, supervisor will be SIGTERMed
    test(cluster(F), replace(F), start, stop),
    test(cluster(F), replace(F), start, repush, stop),
    test(cluster(F), replace(F), start, repush, repush, stop),
    test(cluster(F), replace(F), start, kill, stop),
    test(cluster(F), replace(F), start, kill, repush, stop),

    // no clustering, replace set, but SIHUP will just kill supervisor
    test(cluster(F), replace(T), start, stop),
    test(cluster(F), replace(T), start, repush, stop),
    test(cluster(F), replace(T), start, repush, repush, stop),
    test(cluster(F), replace(T), start, kill, stop),
    test(cluster(F), replace(T), start, kill, repush, stop),

    // clustering, no replace, supervisor will be SIGTERMed and workers will die
    test(cluster(T), replace(F), start, repush, repush, stop),
    test(cluster(T), replace(F), start, repush, kill, repush, stop),

    // cluster, replace, supervisor will be SIGHUPed and workers will restart
    test(cluster(T), replace(T), start, repush, stop),
    test(cluster(T), replace(T), start, repush, repush, stop),
    test(cluster(T), replace(T), start, replace(F), repush, repush, stop),
  ], function() {
    app.ok = true;
    server.stop();
  });
});
