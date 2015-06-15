'use strict';

var concat = require('concat-stream');
var debug = require('debug')('strong-pm:test');
var executor = require.resolve('../bin/sl-pm.js');
var fork = require('child_process').fork;
var tap = require('tap');

tap.test('version,--version', function(t) {
  var version = require('../package.json').version;

  cli('--version').stdout.pipe(concat({encoding: 'string'}, function(line) {
    debug('line <%s>', line);
    t.equal(line.trim(), version);
    t.end();
  }));
});

tap.test('version,-v', function(t) {
  var version = require('../package.json').version;

  cli('-v').stdout.pipe(concat({encoding: 'string'}, function(line) {
    debug('line <%s>', line);
    t.equal(line.trim(), version);
    t.end();
  }));
});

tap.test('help,-h', function(t) {
  cli('-h').stdout.pipe(concat({encoding: 'string'}, function(line) {
    debug('line <%s>', line);
    t.assert(/usage:/.test(line));
    t.end();
  }));
});

tap.test('help,--help', function(t) {
  cli('--help').stdout.pipe(concat({encoding: 'string'}, function(line) {
    debug('line <%s>', line);
    t.assert(/usage:/.test(line));
    t.end();
  }));
});

function cli() {
  var child = fork(executor, [].slice.call(arguments), {silent: true});

  child.stderr.pipe(process.stderr);

  return child;
}
