var app = require('./helper');
var assert = require('assert');
var child_process = require('child_process');
var fs = require('fs');
var path = require('path');
var run = require('../lib/run');
var slPM = require('../index.js');
var util = require('util');

require('shelljs/global');

var server = app.listen();

// Remove default commit listener. Test provides custom implementation
server.removeAllListeners('commit');

var REPO = 'some-repo-name';
var listeningPort = 0;

function running() {
  var current = run.current();
  return current ? current.child : null;
}

// Start the server for initial setup and push once its up
server.on('listening', function(listenAddr) {
  listeningPort = listenAddr.port;
  console.log('Server running on port %d', listeningPort);
  console.log('Pushing repo %s', REPO);
  app.push(REPO);
});

// upon recieving commit. start the app to build it.
// then stop it and trigger the restart via cli command
server.on('commit', function(commit) {
  commit.env = server.env(process.env);
  commit.config = app.configForCommit({});

  commit.appPid = function() {
    var appFile = path.join(this.dir, 'app.pid');
    try {
      return +fs.readFileSync(appFile, 'utf-8');
    } catch (er) {
      // No app.pid
    }
  };

  console.log('Commit received. Preparing and running app');
  app.prepare(commit, function(err) {
    console.log('on prepare:', err || 'success');

    function pollStarted() {
      var appPid = commit.appPid();
      if (running() && appPid) {
        console.log('Last worker pid:', appPid);
        return appCreated(appPid);
      }
      setTimeout(pollStarted, 20);
    }

    server.emit('prepared', commit);
    console.log('Wait for app to compile native deps and start');
    pollStarted();
  });

  function appCreated(appPid) {
    function pollStopped() {
      try {
        process.kill(appPid, 0);
        setTimeout(pollStopped, 20);
      } catch (e) {
        console.log('Stop listener');
        server.stop();
        return attemptRestart();
      }
    }

    console.log('Stop app');
    app.stop(pollStopped);
  };
});

// use the cli to restart application
function attemptRestart() {
  var appPidFile = path.normalize('../receive-base/work/current/app.pid');
  rm(appPidFile);

  console.log('Restart using sl-pm');
  var deploy = child_process.fork(
    require.resolve('../bin/sl-pm'),
    ['-l', listeningPort, '-b', '../receive-base']
  );;

  pollReStarted();

  function pollReStarted() {
    try {
      var pid = +fs.readFileSync(appPidFile, 'utf-8');
      return testPid(pid);
    } catch (er) {
      console.log('Still no %s: %s', appPidFile, er);
      setTimeout(pollReStarted, 500);
    }
  }

  function testPid(pid) {
    console.log('Verify existence of app.pid: %s', pid);
    try {
      process.kill(pid, 0);
      console.log('Killing sl-pm pid %d, should exit and pass', deploy.pid);
      deploy.kill();
      app.ok = true;
    } catch (er) {
      console.error('Application pid created but no app running: %s', er);
      deploy.kill('SIGTERM');
    }
  }
};
