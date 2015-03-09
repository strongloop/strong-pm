var Server = require('../lib/server');
var assert = require('assert');
var async = require('async');
var debug = require('debug')('strong-pm:test');
var path = require('path');
var runner = require('../lib/run');
var tap = require('tap');
var events = require('events');
var util = require('util');

var BASE = path.resolve(__dirname, '.strong-pm');

function MockCurrent() {
  this.child = {
    pid: 59312
  };
}
util.inherits(MockCurrent, events.EventEmitter);

MockCurrent.prototype.request = function request(req, cb) {
  if (req.cmd === 'status') {
    cb({ master: { setSize: 1 } });
  }
  if (req.cmd === 'npm-ls') {
    cb({});
  }
}

var WORKER_PID = 1001;

var USAGE_RECORD = {
  timestamp: Date.now(),
  client: {address: '::1'},
  request: {method: 'GET', url: '/'},
  response: {status: 404, duration: 6},
  process: {pid: WORKER_PID},
  data: {custom: 'value'}
};

tap.test('ExpressUsageRecord', function(t) {
  var s = new Server('pm', '_base', 1234, null);
  var m = s._app.models;
  var commit = {hash: 'hash1', dir: 'dir1'};

  runner._mockCurrent = new MockCurrent();
  runner._mockCurrent.commit = commit;
  runner.current = function() {
    return runner._mockCurrent;
  }

  s._isStarted = true; // Make server think its running.

  async.series([
    function loadModels(next) {
      s._loadModels(next);
    },
    function emitRunning(next) {
      // mock started event from runner
      s._onMasterStart({
        cmd: 'started',
        appName: 'test-app',
        agentVersion: '1.0.0',
        pid: 1234
      }, next);
    },
    function emitFork(next) {
      // mock "fork" event from runner
      runner.emit('request', { cmd: 'fork', id: 1, pid: WORKER_PID }, next);
    },
    function emitUsageRecord(next) {
      var message = { cmd: 'express:usage-record', record: USAGE_RECORD };
      runner.emit('request', message, next);
    },
    function emitTooOldUsageRecord(next) {
      var rec = util._extend({}, USAGE_RECORD);
      rec.timestamp = Date.now() - 24 * 60 * 1000;
      var message = {cmd: 'express:usage-record', record: rec};
      runner.emit('request', message, next);
    },
    function checkUsageRecord(next) {
      m.ExpressUsageRecord.find(function(err, list) {
        if (err) return next(err);
        assert.equal(list.length, 1, util.format('Found %j', list));

        var data = list[0].toObject();

        assert.ok(!!data.processId, 'Process ID should be set');
        assert.equal(data.workerId, 1);
        assert.equal(+data.timeStamp, +USAGE_RECORD.timestamp);
        assert.deepEqual(data.detail, USAGE_RECORD);
        next();
      });
    }
  ], function(err) {
    if (err) throw err;
    t.end();
  });
});
