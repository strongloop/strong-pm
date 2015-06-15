var fmt = require('util').format;
var fs = require('fs');
var path = require('path');
var prepare = require('../lib/drivers/common/prepare').prepare;
var rmrf = require('rimraf');
var tap = require('tap');

var DIR = path.resolve(__dirname, 'app-prepare');
var DEPS = path.resolve(DIR, 'node_modules');
var ADDON = path.resolve(DEPS, 'buffertools'); // Any compiled add-on.
var BUILD = path.resolve(ADDON, 'build');
var DEV = path.resolve(DEPS, 'debug'); // Any dev dependency.

var commit = {
  env: {},
  dir: DIR,
};

tap.test('app has no installed deps', function(t) {
  t.plan(1);
  rmrf(DEPS, function() {
    try {
      fs.readdirSync(DEPS);
      t.assert(false);
    } catch (er) {
      t.assert(er);
    }
  });
});

tap.test('raw app is prepared', function(t) {
  prepare(commit, invariant.bind(null, t));
});

tap.test('uninstalled app is prepared', function(t) {
  prepare(commit, invariant.bind(null, t));
});

tap.test('installed but uncompiled app is prepared', function(t) {
  rmrf.sync(BUILD);
  prepare(commit, invariant.bind(null, t));
});

tap.test('installed and compiled app is prepared', function(t) {
  prepare(commit, invariant.bind(null, t));
});

function invariant(t, err) {
  t.ifError(err);
  exists(t, DEPS);
  exists(t, ADDON);
  exists(t, BUILD);
  notExists(t, DEV);
  t.end();
}

function exists(t, path) {
  t.assert(_exists(path), fmt('path %s should exist', path));
}

function notExists(t, path) {
  t.assert(!_exists(path), fmt('path %s should not exist', path));
}

function _exists(path) {
  return fs.existsSync(path);
}
