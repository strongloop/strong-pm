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

var _now = +new Date();
var _10minAgo = _now - (10*60*1000);
var TRACE_RECORD = {
  start: _10minAgo,
  collectionName: 'httpCalls',
  list: [
    [
      _now,
      '/xyzzy',
      13.092878,
      0,
      {
        closed: true,
        mysql: 2.351871,
        mongodb: 1.623075
      },
      {
        nodes: [
          {
            name: '/xyzzy',
            value: 13.092878
          },
          {
            name: 'MySQL',
            q: 'SELECT 1',
            start: _now,
            value: 2.351871
          },
          {
            name: 'MongoDB',
            q: 'x.find({})',
            start: _now,
            value: 1.623075
          }
        ],
        links: [
          {
            source: 0,
            target: 1,
            value: 2.351871
          },
          {
            source: 0,
            target: 2,
            value: 1.623075
          }
        ]
      }
    ],[
      _10minAgo,
      '/should_not_remember',
      13.092878,
      0,
      {},
      {}
    ]
  ]
};

tap.test('Trace record', function(t) {
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
    function emitTraces(next) {
      var message = {
        cmd: 'agent:trace',
        processId: WORKER_PID,
        workerId: 1,
        trace: TRACE_RECORD
      };
      runner.emit('request', message, next);
    },
    function checkTraces(next) {
      m.AgentTrace.find(function(err, list) {
        if (err) return next(err);
        assert.equal(list.length, 1);
        assert.deepEqual(list[0].trace, TRACE_RECORD.list[0]);
        next();
      });
    }
  ], function(err) {
    if (err) throw err;
    t.end();
  });
});
