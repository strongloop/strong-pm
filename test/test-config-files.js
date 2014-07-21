var assert = require('assert');
var async = require('async');
var debug = require('debug')('strong-pm:test');
var fs = require('fs');

require('shelljs/global');

console.log('working dir for %s is %s', process.argv[1], process.cwd());

var configForCommit = require('../lib/config').configForCommit;
var prepare = require('../lib/prepare').prepare;

// Check for node silently exiting with code 0 when tests have not passed.
var ok = false;

process.on('exit', function(code) {
  if (code === 0) {
    assert(ok);
  }
});

function check(configFile, callback, done) {
  console.log('test config: %s', configFile);
  var commit = {
    config: configForCommit(configFile, {}),
    hash: 'HASH',
    dir: process.cwd(),
  };

  rm('-f', '*.out'); // clear any output from last run
  commit.config.prepare = []; // don't run any commands

  prepare(commit, function(err) {
    callback(err);
    return done();
  });
}

function test(configFile, callback) {
  return function(done) {
    return check(configFile, callback, done);
  }
}

function assertFileSame(src, dst) {
  // just check size for now, should be good enough for tests
  function size(file) {
    return fs.statSync(file).size;
  }
  assert.equal(size(src), size(dst));
}

async.series([
  test('test-config-files-positive.ini', function(err) {
    assert.ifError(err);
    assertFileSame('../index.js', 'copy.out');
  }),
  test('test-config-files-negative.ini', function(err) {
    assert(err && err.code === 'ENOENT');
  }),
], function(er, results) {
  debug('error=%s:', er, results);
  assert.ifError(er);
  ok = true;
});

ok = true;
