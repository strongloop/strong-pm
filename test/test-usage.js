var assert = require('assert');
var async = require('async');
var debug = require('debug')('strong-pm:test');
var path = require('path');

require('shelljs/global');

console.log('working dir for %s is %s', process.argv[1], process.cwd());

var deploy = require('../').deploy;

// Check for node silently exiting with code 0 when tests have not passed.
var ok = false;

process.on('exit', function(code) {
  if (code === 0) {
    assert(ok);
  }
});

function expectError(er) {
  if(er) {
    return null;
  } else {
    return Error('expected error');
  }
}

// argv [0] and [1] are ignored (they are node and script name, not options)
async.parallel([
  deploy.bind(null, ['', '', '-h']),
  deploy.bind(null, ['', '', '--help']),
  deploy.bind(null, ['', '', '-hv']),
  deploy.bind(null, ['', '', '-v']),
  deploy.bind(null, ['', '', '--version']),
  deploy.bind(null, ['', '', '-vh']),
  function(callback) {
    deploy(['', '', 'no-such-arg'], function(er) {
      return callback(expectError(er));
    });
  },
  function(callback) {
    deploy(['', '', '--no-such-option'], function(er) {
      return callback(expectError(er));
    });
  },
  function(callback) {
    deploy(['', '', '-Z'], function(er) {
      return callback(expectError(er));
    });
  },
], function(er, results) {
  debug('test-help: error=%s:', er, results);
  assert.ifError(er);
  ok = true;
});
