var async = require('async');
var http = require('http');
var cicada = require('cicada');
var path = require('path');

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

module.exports = function listen(port, callback) {
  var git = cicada(path.resolve('.strong-deploy'));

  // XXX could serialize response to all commits... so that multiple pushes
  // on same config aren't processed in series
  git.on('commit', function(commit) {
    async.series([
      run(commit, 'npm rebuild'),
      run(commit, 'npm install --production'),
    ], function(err) {
      if (err) {
        // XXX ... can I remove the commit?  not much else to do, would be nice
        // if git push could be failed, but I think its too late for that.
        return;
      }
      server.emit('prepare', commit);
    });
  });

  var server = http.createServer(git.handle);
  server.listen(port);
  server.git = git;
  return server;
}
