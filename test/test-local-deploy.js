'use strict';

var debug = require('debug')('strong-pm:test');
var deployer = require('../lib/drivers/common/local-deploy');
var local = require('./deploy').local;
var path = require('path');
var tap = require('tap');

tap.test('deploy existing app', function(t) {
  debug('deploy existing app');

  var localDir = path.join(__dirname, 'app');
  var container = {
    emit: function(event, commit) {
      t.equal(event, 'prepared');
      t.equal(commit.dir, localDir);
      t.equal(commit.repo, 'app');
      t.assert(commit.hash, 'has hash of pathname');
    },
  };
  var onDeploy = deployer(container);

  debug('onDeploy:', onDeploy);

  t.plan(5);

  local(localDir, function(req, res, client) {
    debug('got local deploy');

    console.assert(req);
    console.assert(res);
    console.assert(client);

    onDeploy.handle(req, res);
  }).once('response', function(data) {
    t.equal(data, 'Application deployed\n', 'response');
  });
});
