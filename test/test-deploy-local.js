var app = require('./helper');
var assert = require('assert');
var path = require('path');

var server = app.listen();

var REPO = 'some-repo-name';
var localDir = path.join(__dirname, 'app');

server.on('listening', function() {
  app.localDeploy(localDir, REPO);
});

server.on('prepared', function(commit) {
  this.stop();
  assert.equal(commit.dir, localDir);
  assert.equal(commit.repo, REPO);
  console.log('PASS');
  app.ok = true;
});
