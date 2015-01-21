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

tap.test('worker status update', function(t) {
  debug('test: worker status update');
  var s = new Server('pm', null, '_base', 1234, null);
  var m = s._app.models;
  var commit = {hash: 'hash1', dir: 'dir1'};

  s._isStarted = true; // Make server think its running.

  runner._mockCurrent = new MockCurrent();
  runner.current = function() {
    return runner._mockCurrent;
  }

  s._loadModels(emitRunning);

  function emitRunning() {
    s.emit('running', commit);
    setImmediate(emitOne);
  }

  function emit(req) {
    return function(callback) {
      runner.emit('request', req, function() {
        debug('done?')
        return callback();
      });
    }
  }

  function emitOne() {
    debug('emit one');
    var fork = {
      cmd: 'fork',
      id: 1, pid: 1001
    };
    var status = {
      cmd: 'status',
      workers: [{id: 1, pid: 1001}],
    };
    var expect = [{id:1, pid:1001}];
    async.series([
      emit(fork),
      //emit(status),
    ], checkWorkers.bind(null, expect, emitTwo));
  }

  function emitTwo() {
    debug('emit two');
    var fork = {
      cmd: 'fork',
      id: 2, pid: 1002
    };
    var status = {
      cmd: 'status',
      workers: [{id:1, pid:1001}, {id:2, pid:1002}],
    };
    var expect = [{id:1, pid:1001}, {id:2, pid:1002}];
    async.series([
      runner.emit.bind(runner, 'request', fork),
      runner.emit.bind(runner, 'request', status),
    ], checkWorkers.bind(null, expect, emitOneDead));
  }

  function emitOneDead() {
    debug('emit one dead');
    var exit = {
      cmd: 'exit',
      id: 1,
      pid: 1001,
      reason: 'SIGTERM',
      suicide: false
    };
    var status = {
      cmd: 'status',
      workers: [{id:2, pid:1002}],
    };
    var expect = [{id:1, pid:1001}, {id:2, pid:1002}]; // XXX stopTime, etc.
    async.series([
      runner.emit.bind(runner, 'request', exit),
      runner.emit.bind(runner, 'request', status),
    ], checkWorkers.bind(null, expect, emitAllDead));
  }

  function emitAllDead() {
    debug('emit all dead');
    var exit = {
      cmd: 'exit',
      id: 2,
      pid: 1002,
      reason: 5,
      suicide: false
    };
    var status = {
      cmd: 'status',
      workers: [],
    };
    var expect = [{id:1, pid:1001}, {id:2, pid:1002}]; // XXX stopTime, etc.
    async.series([
      runner.emit.bind(runner, 'request', exit),
      runner.emit.bind(runner, 'request', status),
    ], checkWorkers.bind(null, expect, end));
  }

  function checkWorkers(expect, next) {
    m.ServiceProcess.find({order: 'workerId ASC' }, function(err, processes) {
      debug('processes: %j', err || processes);
      debug('expect: %j', expect);
      debug('next: %j', next.name);
      expect = expect.map(function(p) {
        return {
          serviceInstanceId: 1,
          workerId: p.id,
          pid: p.pid,
          // XXX start/stop time, etc.
        }
      });
      debug('expect: %j', expect);
      processes = processes.map(function(p) {
        return {
          serviceInstanceId: 1,
          workerId: p.id,
          pid: p.pid,
          // XXX start/stop time, etc.
        }
      });
      t.deepEqual(processes, expect);
      next();
    });
  }

  function end() {
    t.end();
  }
});
