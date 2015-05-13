var assert = require('assert');
var async = require('async');
var debug = require('debug')('strong-pm:test');
var path = require('path');
var tap = require('tap');

require('shelljs/global');

console.log('working dir for %s is %s', process.argv[1], process.cwd());

// Prevent usage text from confusing the TAP parser
console.log = console.error;

var main = require('../').main;

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
var tests = [
  main.bind(null, ['', '', '-h']),
  main.bind(null, ['', '', '--help']),
  main.bind(null, ['', '', '-hv']),
  main.bind(null, ['', '', '-v']),
  main.bind(null, ['', '', '--version']),
  main.bind(null, ['', '', '-vh']),
  function(callback) {
    main(['', '', 'no-such-arg'], function(er) {
      return callback(expectError(er));
    });
  },
  function(callback) {
    main(['', '', '--no-such-option'], function(er) {
      return callback(expectError(er));
    });
  },
  function(callback) {
    main(['', '', '-Z'], function(er) {
      return callback(expectError(er));
    });
  },
];

tap.test('sl-pm usage', function(t) {
  t.plan(tests.length + 1);
  async.parallel(tests, function(err, results) {
    results.forEach(function(res) {
      t.ifError(res);
    });
    t.ifError(err);
    ok = true;
    t.end();
  });
});
