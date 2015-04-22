var _ = require('lodash');
var async = require('async');
var debug = require('debug')('strong-pm:prepare');
var npm = require('strong-spawn-npm');
var mandatory = require('./util').mandatory;

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

function spawn(dir, env, cmd, callback) {
  var args = cmd.split(' ');
  var options = {
    cwd: dir,
    env: _.extend({}, process.env, env),
    stdio: 'inherit',
  };
  args.shift(); // Discard the leading 'npm'.
  return npm(args, options).on('exit', function(code, signal) {
    if (code === 0) return callback();
    var err = Error(signal || code);
    err.command = cmd;
    return err;
  });
}
