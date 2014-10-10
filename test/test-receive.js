var app = require('./helper');
var assert = require('assert');
var path = require('path');

var server = app.listen();

var REPO = 'some-repo-name';

server.on('listening', function() {
  app.push(REPO);
});

server.on('commit', function(commit) {
  this.stop();
  assert.equal(
    require(path.resolve(commit.dir, 'package.json')).name,
    app.APPNAME);
  assert.equal(commit.repo, REPO);
  console.log('PASS');
  app.ok = true;
});
