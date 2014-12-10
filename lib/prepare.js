var _ = require('lodash');
var async = require('async');
var fs = require('fs');
var path = require('path');

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

function copy(commit, dst, src, callback) {
  var hash = commit.hash;

  // src is relative to config file, dst is relative to working dir
  srcFull = path.resolve(commit.config.configFile, '..', src);
  dstFull = path.resolve(commit.dir, dst);
  console.log('commit %s copy `%s` to `%s`', hash, srcFull, dst);

  try {
    fs.writeFileSync(dstFull, fs.readFileSync(srcFull));
  } catch(err) {
    console.log('commit %s copy `%s` to `%s` => %s', hash, srcFull, dst, err);
    return process.nextTick(callback.bind(null,err));
  }
  process.nextTick(callback);
}

exports.prepare = function prepare(commit, callback) {
  // Commands may rely on copies... so we do copies first.
  var copies = Object.keys(commit.config.files).map(function(dst) {
    return copy.bind(null, commit, dst, commit.config.files[dst]);
  });

  var commands = commit.config.prepare.map(function(cmd) {
    return run(commit, cmd);
  });
  return async.series(copies.concat(commands), callback);
}
