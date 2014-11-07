var Server = require('../lib/server');
var assert = require('assert');
var async = require('async');
var debug = require('debug')('strong-pm:test');
var path = require('path');
var runner = require('../lib/run');
var tap = require('tap');

var BASE = path.resolve(__dirname, '.strong-pm');

tap.test('new server', function(t) {
  var s = new Server('pm', null, '_base', 0, null);
  t.end();
});

tap.test('new server', function(t) {
  t.plan(7);

  var s = new Server('pm', null, '_base', 0, null);
  s._loadModels(function() {
    var m = s._app.models;
    m.Executor.findById(1, function(err, _) {
      debug('executor:', _);
      assert.ifError(err);
      t.equal(_.id, 1);
      t.equal(_.address, 'localhost');
    });
    m.ServerService.findById(1, function(err, _) {
      debug('service:', _);
      assert.ifError(err);
      t.equal(_.id, 1);
      t.equal(_.name, 'default');
      t.equal(_._groups[0].id, 1);
      t.equal(_._groups[0].name, 'default');
      t.equal(_._groups[0].scale, 1);
    });
    // FIXME ServerInstance should exist
  });
});

tap.test('service starts', function(t) {
  var s = new Server('pm', null, '_base', 1234, null);
  var m = s._app.models;

  s._isStarted = true; // Make server think its running.
  s._loadModels(firstRun);

  function firstRun() {
    debug('first run');
    var commit = {hash: 'hash1', dir: 'dir1'};
    s.emit('running', commit);
    // Give it a tick to update.
    setImmediate(checkInstance.bind(null, commit, secondRun));
  }

  function secondRun() {
    debug('second run');
    var commit = {hash: 'hash2', dir: 'dir2'};
    s.emit('running', commit);
    // Give it a tick to update.
    setImmediate(checkInstance.bind(null, commit, end));
  }

  function checkInstance(commit, next) {
    m.ServiceInstance.findById(1, function(err, _) {
      debug('instance: %j next: %j', _, next.name);
      assert.ifError(err);
      t.equal(_.id, 1);
      t.equal(_.executorId, 1);
      t.equal(_.serverServiceId, 1);
      t.equal(_.groupId, 1);
      t.equal(_.currentDeploymentId, commit.hash);
      t.assert(_.deploymentStartTime < new Date());
      t.equal(_.port, undefined); // XXX(sam) requires supervisor support
      t.equal(s._listenPort, 1234);
      t.equal(_.PMPort, s._listenPort);

      m.ServerService.findById(1, function(err, _) {
        debug('service: %j', _);
        assert.ifError(err);
        t.equal(_.id, 1);
        t.equal(_.deploymentInfo.hash, commit.hash);
        t.equal(_.deploymentInfo.dir, commit.dir);
        next();
      });
    });
  }

  function end() {
    var tasks = {
      ServerService: 0,
      Executor: 0,
      ServiceInstance: 0,
      Group: 0,
    };
    for (var type in tasks) {
      tasks[type] = function(callback) {
        m[type].count(callback);
      };
    }

    async.parallel(tasks, function(counts) {
      debug('counts: %j', counts);

      for (var type in counts) {
        t.equal(counts[type], 1, type);
      }
      t.end();
    });
  }
});
