var async = require('async');

function spawn(commit, cmd, callback) {
  // probably want to spec options.cwd, and .env, maybe use same .env
  // during prepare and export/run
  var options = {
    // cwd: commit.spawn sets to working directory for commit
    env: process.env,
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
  var commands = commit.config.prepare.map(function(cmd) {
    return run(commit, cmd);
  });
  return async.series(commands, callback);
}
