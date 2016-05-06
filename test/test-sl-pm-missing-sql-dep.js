// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: strong-pm
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

var async = require('async');
var exec = require('child_process').exec;
var fmt = require('util').format;
var fs = require('fs');
var home = require('userhome');
var path = require('path');
var rimraf = require('rimraf');
var test = require('tap').test;

var script = path.join(__dirname, '..', 'bin', 'sl-pm.js');
var moduleDir = path.dirname(require.resolve('loopback-connector-sqlite3'));
var tempDir = fmt('%s_tmp', moduleDir);
var base = home('.strong-pm');

test('test setup', function(t) {
  function rename(cb) {
    fs.rename(moduleDir, tempDir, function(err, res) {
      t.ifErr(err, 'Should not get an error renaming directories');
      try {
        require('loopback-connector-sqlite3');
        t.fail('Should not have been able to load loopback-connector-sqlite3');
      } catch (err) {
        t.ok('Got an error trying to require loopback-connector-sqlite3');
      }
      cb();
    });
  };
  async.parallel([rename, rimraf.bind(null, base)], t.end);
});

test('invoke sl-pm missing sqllite dep', function(t) {
  var cmd = ['node', script];
  exec(cmd.join(' '), function(err, stdOut, stdErr) {
    t.ok(err);
    t.equals(err.code, 1);
    t.equals(stdErr, 'loopback-connector-sqlite3 must be installed to ' +
      'use the sql backend. Use the --json-file-db option if you are unable ' +
      'to install loopback-connector-sqlite3. Error encountered while trying ' +
      'to upgrade: [ Cannot find module \'loopback-connector-sqlite3\' ]\n');

    t.end();
  });
});

test('invoke sl-pm --json-file-db', function(t) {
  var cmd = ['node', script, '--json-file-db'].join(' ');
  var child = exec(cmd, { timeout: 30000 }, function(err, stdOut, stdErr) {
    t.ok(err);
    t.ok(err.signal);
    t.equals(err.signal, 'SIGQUIT');
    t.end();
  });

  var buffered = '';
  child.stdout.on('data', function(data) {
    buffered += data;

    if (buffered.match(/Browse your REST API/)) {
      t.comment('Found `Browse your REST API` stdout.');
      child.kill('SIGQUIT');
    }
  });
});

test('test cleanup', function(t) {
  fs.rename(tempDir, moduleDir, function(err, res) {
    t.ifErr(err, 'Should not get an error renaming directories');
    t.end();
  });
});
