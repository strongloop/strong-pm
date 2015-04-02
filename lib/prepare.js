var _ = require('lodash');
var async = require('async');
var fs = require('fs');
var path = require('path');

// XXX(sam) use strong-npm-spawn and not commit.spawn? Would allow this to
// become fairly independent of the commit. But perhaps it would be better
// for strong-npm-spawn to return the cmd string... so I can spawn it
// use cicada.

// XXX(sam) needs unit tests for this UNIT (that does the node-gyp, etc,
// so the test app does not need to)
function spawn(commit, cmd, callback) {
  // probably want to spec options.cwd, and .env, maybe use same .env
  // during prepare and export/run
  var options = {
    // cwd: commit.spawn sets to working directory for commit
    env: _.extend({}, process.env, commit.env),
    stdio: 'inherit',
  };
  return commit.spawn(cmd, options).on('exit', function(code, signal) {
    if (code === 0) return callback();
    var err = Error(signal || code);
    err.command = cmd;
    err.commit = commit;
    return err;
  });
}

function run(commit, cmd) {
  return function(done) {
    console.log('commit %s spawn `%s`...', commit.hash, cmd);
    spawn(commit, cmd, function(err) {
      console.log('commit %s spawn `%s` => %s', commit.hash, cmd, err || 'OK');
      return done(err);
    });
  };
}

exports.prepare = function prepare(commit, callback) {
  var commands = [
    'npm rebuild',
    'npm install --production',
  ];
  var functions = commands.map(function(cmd) {
    return run(commit, cmd);
  });
  return async.series(copies.concat(commands), callback);
};
