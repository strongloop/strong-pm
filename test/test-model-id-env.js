var app = require('./helper');
var assert = require('assert');
var debug = require('debug')('strong-pm:test');
var async = require('async');
var request = require('request');
var util = require('util');

process.env.STRONGLOOP_SERVICE_ID = '42';
process.env.STRONGLOOP_SERVICE_GROUP_ID = '43';
process.env.STRONGLOOP_EXECUTOR_ID = '44';
process.env.STRONGLOOP_INSTANCE_ID = '45';

var server = app.listen();
server.once('listening', function(addr) {
  app.push(null, runTests);
});

function runTests() {
  async.series([
    checkService,
    checkInstance,
    checkExecutor,
    checkProcess,
  ], function(err){
    assert.ifError(err);

    app.ok = true;
    server.stop();
    app.stop();
  });

  function checkService(cb) {
    server._app.models.ServerService.findOne(function(err, m) {
      assert.ifError(err);
      assert.equal(m.id, 42);
      assert.equal(m._groups[0].id, 43);
      cb();
    });
  }

  function checkInstance(cb) {
    server._app.models.ServiceInstance.findOne(function(err, m) {
      assert.ifError(err);
      assert.equal(m.id, 45);
      cb();
    });
  }

  function checkExecutor(cb) {
    server._app.models.Executor.findOne(function(err, m) {
      assert.ifError(err);
      assert.equal(m.id, 44);
      cb();
    });
  }

  function checkProcess(cb) {
    server.once('fork', function(){
      server._app.models.ServiceProcess.findOne(function(err, m) {
        assert.ifError(err);
        debug(m);
        assert.equal(m.serviceInstanceId, 45);
        cb();
      });
    });
  }
}
