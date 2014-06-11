var app = require('./helper');
var assert = require('assert');
var async = require('async');
var path = require('path');
var util = require('util');

var server = app.listen();

function pushWithConfig(config, callback) {
  console.log('***** test: push config %j', config);

  config = util._extend(app.configForCommit('', {}), config);

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
        var signame = config.stop[0];
        var constants = process.binding('constants');
        var signo = constants[signame];

        console.log('Ran app with status: %s config: %s (%s)',
          status, signame, signo);

        // expect runner to use SIGTERM on invalid configuration
        // expect app to exit with signal number

        assert.equal(status, signo || constants.SIGTERM);
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
    test({}),
    test({ stop: ['SIGINT']}),
    // Test various kinds of valid ini file syntax, with invalid configuration.
    test({ stop: ['not-a-signal']}), // stop = not-a-signal
    test({ stop: []}), // stop =
    test({ stop: ['SIGHUP', 'to be ignored']}), // stop[]=SIGHUP\nstop[]=to ...
  ], function(err) {
    assert.ifError(err);
    app.ok = true;
    server.close();
    app.stop();
  });
});
