var assert = require('assert');
var async = require('async');
var debug = require('debug')('strong-pm:test');

console.log('working dir for %s is %s', process.argv[1], process.cwd());

var prepare = require('../lib/prepare').prepare;

// Check for node silently exiting with code 0 when tests have not passed.
var ok = false;

process.on('exit', function(code) {
  if (code === 0) {
    assert(ok);
  }
});

function test(config) {
  return function(callback) {
    console.log('test config: %j', config);
    var commit = {
      config: {
        files: {},
        prepare: config,
      },
      hash: 'HASH',
      commands: [],
      env: process.env,
      spawn: function(cmd, options) {
        assert.deepEqual(options.env, process.env);
        assert.equal(options.stdio, 'inherit');
        this.commands.push(cmd);
        return this;
      },
      on: function(event, callback) {
        assert.equal(event, 'exit');
        process.nextTick(function() {
          callback(0);
        });
      },
    };

    prepare(commit, function(err) {
      console.log('commands: %j', err || commit.commands);
      assert.ifError(err);
      assert.deepEqual(config, commit.commands);
      return callback();
    });
  };
}

async.series([
  test(require('../lib/config').configDefaults.prepare),
  test([]),
  test(['some command']),
  test(['some command', 'some other command', 'an another']),
], function(er, results) {
  debug('error=%s:', er, results);
  assert.ifError(er);
  ok = true;
});

ok = true;
