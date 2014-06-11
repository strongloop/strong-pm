var app = require('./helper');
var assert = require('assert');
var async = require('async');
var path = require('path');

var server = app.listen();

function pushWithConfig(config, callback) {
  console.log('push config %j', config);

  var repo = app.push();

  server.once('commit', function(commit) {
    console.log('on commit:', commit);
    assert.equal(commit.repo, repo);

    commit.config = config;

    app.prepare(commit, function(err) {
      console.log('on prepare:', err);
      if (err) {
        return callback(err);
      }

      setTimeout(function() {
        // Chould poll to ensure app's http port is reachable... but we don't
        // know what port its running on, and don't have its stdio output!
        console.log('on timeout, stopping app');
        app.stop();
      }, 1000);

      app.run(commit).once('exit', function(status) {
        console.log('Ran app with status:', status);
        return callback();
      });
    });

  });
}

function test(config) {
  return pushWithConfig.bind(null, config);
}

server.once('listening', function() {
  async.series([
    test(app.configForCommit('', {})),
  ], function(err) {
    assert.ifError(err);
    app.ok = true;
    server.close();
    app.stop();
  });
});
