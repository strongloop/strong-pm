'use strict';

var EE = require('events').EventEmitter;

exports.testConstructor = testDriverConstructor;
exports.testInstance = testDriverInstance;

function testDriverConstructor(tap, Driver) {
  tap.test('driver mandatory options', function(t) {
    var baseDir = 'BASE';
    var server = {};
    var logger = {};
    t.equal(Driver.length, 1, 'constructor accepts 1 argument');
    t.doesNotThrow(function() {
      new Driver({
        baseDir: baseDir,
        console: logger,
        server: server,
      });
    });
    t.throws(function() {
      new Driver({
        console: logger,
        server: server,
      });
    });
    t.throws(function() {
      new Driver({
        baseDir: baseDir,
        server: server,
      });
    });
    t.throws(function() {
      new Driver({
        baseDir: baseDir,
        console: logger,
      });
    });
    t.end();
  });
}

function testDriverInstance(tap, i) {
  tap.test('driver instance API', function(t) {
    t.isa(i, EE, 'instances are event emitters');
    t.equal(i.setStartOptions.length, 2, '.startOptions(id, opts)');
    t.equal(i.removeInstance.length, 2, '.removeInstance(id, cb)');
    t.equal(i.deployInstance.length, 3, '.deployInstance(id, req, res)');
    t.equal(i.startInstance.length, 2, '.startInstance(id, cb)');
    t.equal(i.stopInstance.length, 3, '.stopInstance(id, style, cb)');
    t.equal(i.dumpInstanceLog.length, 1, '.dumpInstanceLog(id)');
    t.equal(i.updateInstanceEnv.length, 3, '.updateInstanceEnv(id, env, cb)');
    t.equal(i.requestOfInstance.length, 3, '.requestOfInstance(id, req, cb)');
    t.equal(i.start.length, 2, '.start(meta, cb)');
    t.equal(i.stop.length, 1, '.stop(cb)');
    // XXX(rmg): to be removed
    t.equal(i._containerById.length, 1, '._containerById(id)');
    t.end();
  });
}
