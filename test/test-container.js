'use strict';

var Container = require('../lib/container');
var path = require('path');
var tap = require('tap');

tap.test('container start options', function(t) {
  var c = new Container({svcId: 7, baseDir: '_base', server: {}});

  t.equal(c.getStartCommand(), 'sl-run --cluster=CPU');

  c.setStartOptions({profile: false});
  t.equal(c.getStartCommand(), 'sl-run --cluster=CPU --no-profile');

  c.setStartOptions({trace: true});
  t.equal(c.getStartCommand(), 'sl-run --cluster=CPU --no-profile --trace');

  c.setStartOptions({profile: true});
  t.equal(c.getStartCommand(), 'sl-run --cluster=CPU --trace');

  c.setStartOptions({trace: false, profile: false});
  t.equal(c.getStartCommand(), 'sl-run --cluster=CPU --no-profile');

  c.setStartOptions({profile: true});
  t.equal(c.getStartCommand(), 'sl-run --cluster=CPU');

  t.end();
});

// TODO:
// - remove
// - runCurrent: repo + hash parsing

tap.test('run with empty current services', function(t) {
  var c = new Container({
    svcId: 'does-not-exist',
    baseDir: path.resolve(__dirname, 'direct-driver-workdir'),
    server: {}
  });

  t.plan(1);

  c.runCurrent(function(err) {
    t.ifError(err);
  });
});

tap.test('run with current service', function(t) {
  var env = {X: 'Y'};
  var server = {
    env: function() { return env; },
  };
  var options = {
    svcId: 'aaaa',
    baseDir: path.resolve(__dirname, 'direct-driver-workdir'),
    server: server,
  };
  var c = new Container(options);

  t.plan(8);

  // Prevent container trying to start the service
  c.removeAllListeners('prepared');

  c.on('prepared', function(commit) {
    var id = '73b6c151a7bcf9ef5e4ed538fb0c31a37d808f21.1428983431789';
    var hash = '73b6c151a7bcf9ef5e4ed538fb0c31a37d808f21';
    var dir = path.resolve(options.baseDir, 'svc', 'aaaa', 'work', id);
    t.equal(commit.id, id, 'id');
    t.equal(commit.dir, dir, 'dir');
    t.equal(commit.repo, options.svcId, 'repo');
    t.equal(commit.hash, hash, 'hash');
    t.equal(commit.branch, 'default', 'branch');
    t.deepEqual(commit.env, env, 'env');
    t.equal(commit.container, c, 'container');
  });

  c.runCurrent(function(err) {
    t.ifError(err);
  });
});

// - onDeployment
// - updateEnv
// - readableLogSnapshot
// - flushLogs
