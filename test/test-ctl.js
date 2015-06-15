var tap = require('tap');
var ctl = require('../lib/ctl');
var Server = require('../lib/server');
var util = require('util');
var ServiceManager = require('../lib/service-manager');
var NullDriver = require('./null-driver');

tap.test('shutdown', {todo: true}, function(t) {
  t.end();
});

tap.test('start', {todo: true}, function(t) {
  t.end();
});

tap.test('stop', {todo: true}, function(t) {
  t.end();
});

tap.test('soft-stop', {todo: true}, function(t) {
  t.end();
});

tap.test('restart', {todo: true}, function(t) {
  t.end();
});

tap.test('soft-restart', {todo: true}, function(t) {
  t.end();
});

tap.test('env-set', function(t) {
  t.plan(4);

  function MockServer() {
    this._driver = new MockDriver(this);
  }
  util.inherits(MockServer, Server);

  function MockDriver(server) {
    this.server = server;
  }
  util.inherits(MockDriver, NullDriver);

  t.assert(NullDriver.prototype.updateInstanceEnv, 'Driver method exists');
  MockDriver.prototype.updateInstanceEnv = function(id, env, callback) {
    t.equal(id, '1', 'defaults to instance id 1');
    setImmediate(callback, null, env);
  };

  var opts = {server: new MockServer()};
  var req = {cmd: 'env-set', env: {foo: 'bar'}};
  ctl(opts, req, function(rsp) {
    t.assert(!rsp.error, 'should not error');
    t.assert(rsp.message, 'should have a message');
    t.end();
  });
});

tap.test('env-get', function(t) {
  t.plan(4);

  function MockServer() {
    this._serviceManager = new MockServiceManager(this);
  }
  util.inherits(MockServer, Server);

  function MockServiceManager(server) {
    this.server = server;
  }

  t.assert(ServiceManager.prototype.getInstanceEnv,
           'ServiceManager method exists');
  MockServiceManager.prototype.getInstanceEnv = function(id, callback) {
    t.equal(id, '1', 'defaults to instance id 1');
    setImmediate(callback, null, {});
  };

  var opts = {server: new MockServer()};
  var req = {cmd: 'env-get'};
  ctl(opts, req, function(rsp) {
    t.assert(!rsp.error, 'should not error');
    t.assert(rsp.env, 'should have an env');
    t.end();
  });
});

tap.test('log-dump', {todo: true}, function(t) {
  t.end();
});

tap.test('current', function(t) {
  function MockServer() {
    this._driver = new MockDriver(this);
  }
  util.inherits(MockServer, Server);

  function MockDriver(server) {
    this.server = server;
  }
  util.inherits(MockDriver, NullDriver);

  t.assert(NullDriver.prototype.requestOfInstance, 'Driver method exists');
  MockDriver.prototype.requestOfInstance = function(id, req, callback) {
    t.equal(req.cmd, 'sub-cmd', 'driver is given sub cmd');
    setImmediate(callback, {message: 'response'});
  };

  var opts = {server: new MockServer()};
  var req = {cmd: 'current', sub: 'sub-cmd'};
  ctl(opts, req, function(rsp) {
    t.assert(!rsp.error, 'should not error');
    t.equal(rsp.message, 'response', 'should be response');
    t.end();
  });
});
