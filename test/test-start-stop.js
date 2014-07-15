var app = require('./helper');
var assert = require('assert');
var async = require('async');
var path = require('path');
var util = require('util');

var server = app.listen();

function pushWithConfig(config, failStatus, callback) {
  console.log('\n\n');
  console.log('TEST: push config %j expect fail? %s', config, failStatus);

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
        // Should poll to ensure app's http port is reachable... but we don't
        // know what port its running on, and don't have its stdio output!
        // XXX(sam) can poll for existence of output file, see other tests
        console.log('on timeout, stopping app');
        app.stop();
      }, 1000);

      app.run(commit).once('exit', function(status) {
        if (failStatus != null) {
          assert.equal(failStatus, status);
          app.stop();
          return callback();
        }

        var signame = config.stop[0];
        var constants = process.binding('constants');
        var signo = constants[signame];

        console.log('Ran app with status: %s config: %s (%s)',
          status, signame, signo);

        // expect runner to use SIGTERM on invalid configuration
        // if signame is valid, it will have a signo > 0

        assert.equal(status, signo ? signame : 'SIGTERM');
        return callback();
      });
    });

  });
}

function test(config, failStatus) {
  return pushWithConfig.bind(null, config, failStatus);
}

// XXX(sam) remove once strong-supervisor#34 is fixed
// This hack reverts to non-clustered mode, until supervisor ensures its exit
// status reflects the signal it was killed with
require('../lib/config').configDefaults.start = ['sl-run'];

server.once('listening', function() {
  async.series([
    test({}),
    test({start: ['node .']}),
    test({start: ['node .'], stop: ['SIGINT']}),
    test({start: ['sl-run'], stop: ['SIGHUP']}),
    // Test various kinds of valid ini file syntax, with invalid configuration.
    test({start: ['node no-such-file']}, 8), // node status for no file
    test({start: ['sl-run no-such-file']}, 1), // slr status for no file
    test({start: ['no-runner whatever']}, 127), // shell status for no file
    test({start: ['sl-run', 'ignored']}),
    test({start: []}),
    test({start: ['']}),
    test({stop: ['SIGINT']}),
    test({stop: ['not-a-signal']}), // stop = not-a-signal
    test({stop: []}), // stop =
    test({stop: ['SIGHUP', 'ignored']}), // stop[]=SIGHUP\nstop[]=ignored
  ], function(err) {
    assert.ifError(err);
    app.ok = true;
    server.close();
    app.stop();
    console.log('PASS');
  });
});
