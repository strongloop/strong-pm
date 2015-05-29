'use strict';

var assert = require('assert');
var EventEmitter = require('events').EventEmitter;
var util = require('util');

module.exports = exports = NullDriver;

function NullDriver(options) {
  if (!(this instanceof NullDriver)) {
    return new NullDriver(options);
  }
  assert('baseDir' in options, 'baseDir is provided');
  assert('console' in options, 'console is provided');
  assert('server' in options, 'server is provided');
  EventEmitter.call(this);
}

util.inherits(NullDriver, EventEmitter);

exports.type = 'Null';

NullDriver.prototype.setStartOptions = function(id, opts) {
  assert(id, 'id is provided');
  assert(opts, 'opts is provided');
  return;
};

NullDriver.prototype.removeInstance = function(id, cb) {
  assert(id, 'id is provided');
  setImmediate(cb);
};

NullDriver.prototype.deployInstance = function(id, req, res) {
  assert(id, 'id is provided');
  assert(req, 'req is provided');
  assert(res, 'res is provided');
  return;
};

NullDriver.prototype.startInstance = function(id, cb) {
  assert(id, 'id is provided');
  setImmediate(cb);
};

NullDriver.prototype.stopInstance = function(id, style, cb) {
  assert(id, 'id is provided');
  setImmediate(cb);
};

NullDriver.prototype.dumpInstanceLog = function(id) {
  assert(id, 'id is provided');
  return;
};

NullDriver.prototype.updateInstanceEnv = function(id, env, cb) {
  assert(id, 'id is provided');
  setImmediate(cb);
};

NullDriver.prototype.requestOfInstance = function(id, req, cb) {
  assert(id, 'id is provided');
  setImmediate(cb);
};

NullDriver.prototype.start = function(meta, cb) {
  assert(meta, 'meta is provided');
  setImmediate(cb);
};

NullDriver.prototype.stop = function(cb) {
  setImmediate(cb);
};

NullDriver.prototype.instanceById = function(id) {
  assert(id, 'id is provided');
  return {
    commit: {hash: null, dir: null},
    restartCount: 0,
    pid: process.pid,
    driverMeta: null,
  };
};

NullDriver.prototype.getName = function() {
  return 'Null';
};

NullDriver.prototype.getStatus = function() {
  return 'running';
};
