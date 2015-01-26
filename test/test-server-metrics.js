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

tap.test('metrics update', function(t) {
  var s = new Server('pm', null, '_base', 1234, null);
  var m = s._app.models;
  var commit = {hash: 'hash1', dir: 'dir1'};

  runner._mockCurrent = new MockCurrent();
  runner._mockCurrent.commit = commit;
  runner.current = function() {
    return runner._mockCurrent;
  }

  s._isStarted = true; // Make server think its running.
  s._loadModels(emitRunning);

  function emitRunning() {
    // mock started event from runner
    s._onMasterStart({
      cmd: 'started',
      appName: 'test-app',
      agentVersion: '1.0.0',
      pid: 1234
    }, emitOne);
  }

  function emitOne() {
    debug('emit one');
    var fork = {
      cmd: 'fork',
      id:1,
      pid:1001,
    };
    var exit = {
      cmd: 'exit',
      id:1,
      pid:1001,
      reason: 'killed',
      suicide: false
    };
    async.series(
      [
        runner.emit.bind(runner, 'request', fork),
        runner.emit.bind(runner, 'request', exit),
        runner.emit.bind(runner, 'request', fork)
      ],
      emitMetrics
    );
  }

  var MARGIN = 5 * 1000; // in seconds
  var METRICS = {
    processes: {
      "1" : {
        "timers" : {},
        "gauges" : {
          "loop.maximum" : 1,
          "loop.average" : 0.09375,
          "gc.heap.used" : 63861677,
          "loop.minimum" : 0,
          "cpu.total" : 0.93709,
          "heap.used" : 86413777,
          "cpu.user" : 0.0617,
          "heap.total" : 272764783,
          "cpu.system" : 0.87539
        },
        "counters" : {
          "http.connection.count" : 0,
          "loop.count" : 64
        }
      },
      "0" : {
        "gauges" : {
          "cpu.user" : 0.05637,
          "cpu.system" : 0.70378,
          "heap.total" : 184060823,
          "loop.minimum" : 0,
          "heap.used" : 38328002,
          "cpu.total" : 0.76015,
          "loop.average" : 0.02667,
          "loop.maximum" : 1,
          "gc.heap.used" : 30269832
        },
        "counters" : {
          "loop.count" : 75
        },
        "timers" : {}
      },
    },
    "timestamp" : new Date().getTime() - 5 * 60 * 1000 + MARGIN,
  }

  function emitMetrics() {
    debug('emit metrics');

    var req = { cmd: 'metrics', metrics: METRICS };
    runner.emit('request', req, checkMetrics);
  }

  function checkMetrics() {
    function checkMetric(wid, callback) {
      var metric = METRICS.processes[wid];
      wid = Number(wid);
      debug('check metric for %d:', wid, metric);
      // Note that lib/server mutates metrics during request handling... which
      // it is allowed to do, but what we see below is not exactly the same
      // as the metrics message seen above.
      m.ServiceMetric.findOne({where: {workerId: wid}}, function(err, obj) {
        debug('found metric for %d:', wid, err || obj);
        assert.equal(obj.workerId, wid);
        assert.equal(String(obj.timeStamp), String(new Date(METRICS.timestamp)));
        t.deepEqual(obj.timers, metric.timers);
        t.deepEqual(obj.gauges, metric.gauges);
        t.deepEqual(obj.counters, metric.counters);
        m.ServiceProcess.findById(obj.processId, function(err, proc) {
          t.ifError(err);
          t.ok(!proc.stopReason, 'Stop reason should be unset');
          callback();          
        });
      });
    }
    async.each(['1'], checkMetric, emitNewMetrics);
    // FIXME 0 doesn't pass, because it has no Process, because the master
    // isn't forked :-(
    //async.each(Object.keys(METRICS.processes), checkMetric, end);
  }

  function emitNewMetrics() {
    debug('emit new metrics');
    // Wait for MARGIN to cause last metrics to be outdated, then report empty
    // metrics to trigger the cleanup.
    var req = { cmd: 'metrics', metrics: { processes: {} } };
    setTimeout(function() {
      runner.emit('request', req, checkNewMetrics);
    }, MARGIN);
  }

  function checkNewMetrics() {
    var where = {
      timeStamp: {lt: METRICS.timestamp - 5 * 60 * 1000},
    };
    m.ServiceMetric.count(/*where,*/ function(er, count) {
      assert.ifError(er);
      t.equal(count, 0, 'old should be deleted');
      end();
    });
  }

  function end() {
    t.end();
  }
});
