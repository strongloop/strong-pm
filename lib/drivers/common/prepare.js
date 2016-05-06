// Copyright IBM Corp. 2015. All Rights Reserved.
// Node module: strong-pm
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

var _ = require('lodash');
var async = require('async');
var debug = require('debug')('strong-pm:prepare');
var npm = require('strong-spawn-npm');
var mandatory = require('../../util').mandatory;

// Private properties are for tests.
exports._COMMANDS = COMMANDS;
exports._prepare = _prepare;
exports.prepare = prepare;

var COMMANDS = [
  'npm rebuild',
  'npm install --production',
];

function prepare(commit, callback) {
  return _prepare(mandatory(commit.dir), mandatory(commit.env), callback);
}

function _prepare(dir, env, callback) {
  debug('running %j in %j', COMMANDS, dir);

  var functions = COMMANDS.map(function(cmd) {
    if (process.env.STRONGLOOP_PM_SKIP_DEFAULT_INSTALL) {
      return skipRun(dir, env, cmd);
    }
    return run(dir, env, cmd);
  });

  return async.series(functions, callback);
}

function run(dir, env, cmd) {
  return function(done) {
    debug('dir %j: `%j`...', dir, cmd);
    spawn(dir, env, cmd, function(err) {
      debug('dir %j: `%s` => %s', dir, cmd, err || 'OK');
      if (err) {
        err.cmd = cmd;
        err.dir = dir;
      }
      return done(err);
    });
  };
}

function skipRun(dir, env, cmd) {
  return function(done) {
    debug('dir %j: skipping `%j`...', dir, cmd);
    setImmediate(done);
  };
}

function spawn(dir, env, cmd, callback) {
  var args = cmd.split(' ');
  var options = {
    cwd: dir,
    env: _.extend({}, process.env, env),
    stdio: ['ignore', debug.enabled ? process.stdout : 'ignore', 'pipe'],
  };
  args.shift(); // Discard the leading 'npm'.
  var child = npm(args, options).on('exit', function(code, signal) {
    if (code === 0) return callback();
    var err = Error(signal || code);
    err.command = cmd;
    return err;
  });
  // redirect stderr to stdout to better consolidate npm output in PM logs
  child.stderr.pipe(process.stdout, {end: false});
  return child;
}
