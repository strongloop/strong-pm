// XXX(sam) should this be a seperate module? Maybe not necessary if we keep its
// interface very clear.
'use strict';

var Container = require('./container');
var EventEmitter = require('events').EventEmitter;
var assert = require('assert');
var async = require('async');
var debug = require('debug')('strong-pm:direct-driver');
var mandatory = require('./../../util').mandatory;
var path = require('path');
var util = require('util');

module.exports = exports = Driver;

function Driver(options) {
  if (!(this instanceof Driver))
    return new Driver(options);

  EventEmitter.call(this);

  this._Container = options.Container || Container;
  this._baseDir = mandatory(options.baseDir);
  this._console = mandatory(options.console);
  this._server = mandatory(options.server);

  this._containers = Object.create(null);
  this.on('request', this._onRequest.bind(this));
}

util.inherits(Driver, EventEmitter);

// XXX(sam) would better if services were persisted, so we could read
// deployment info from models, and start them. But that's not necessary
// for multi-app, lets leave it as a change for docker support. Once we
// did that the Server would explicitly re-start services like:
//
// for s in models.ServerService.find()
//   description = deploymentInfo (driver-specific)
//
//   driver.restart(description) // runner, serviceId
// end
// @kraman isn't above comment obsolete now?
Driver.prototype.start = function(instanceMetas, callback) {
  var self = this;
  var instanceBase = path.resolve(this._baseDir, 'instance');

  callback = callback || function() {};

  debug('start: instanceBase %j', instanceBase);

  var instanceIds = Object.keys(instanceMetas);
  debug('start: current instances %j', instanceIds);

  async.each(instanceIds, run, function(err) {
    assert.ifError(err);
    return callback();
  });

  function run(instanceId, callback) {
    var size = instanceMetas[instanceId].size;
    debug('start at size %j for instance %j', size, instanceId);
    self._containerById(instanceId).setStartOptions({size: size});
    self._containerById(instanceId).runCurrent(callback);
  }

  return this;
};

Driver.prototype.stop = function(callback) {
  for (var instanceId in this._containers) {
    debug('stopping instance %j', instanceId);
    this._containers[instanceId].stop('hard');
  }
  // XXX(sam) container stop is async, but the server doesn't care, ATM, so
  // don't bother waiting.
  if (callback) process.nextTick(callback);
};

Driver.prototype.setStartOptions = function(instanceId, options) {
  this._containerById(instanceId).setStartOptions(options);
};

Driver.prototype.deployInstance = function(instanceId, req, res) {
  this._containerById(instanceId).deployInstance(req, res);
};

Driver.prototype.startInstance = function(instanceId, callback) {
  debug('start instance %d', instanceId);
  this._containerById(instanceId).start(callback);
};

Driver.prototype.stopInstance = function(instanceId, style, callback) {
  debug('stop instance %d (%s)', instanceId, style);
  this._containerById(instanceId).stop(style, callback);
};

Driver.prototype.removeInstance = function(instanceId, callback) {
  var container = this._containers[instanceId];

  debug('remove instance %d exists? %j', instanceId, !!container);

  if (!container)
    return setImmediate(callback);

  delete this._containers[instanceId];

  container.remove(callback);
};

Driver.prototype.dumpInstanceLog = function(instanceId) {
  var container = this._containerById(instanceId);
  debug('dumpInstanceLog(%j) size: %j current? %j child? %j',
        instanceId, current, child);
  var current = !!container.current;
  var child = current ? !!container.current.child : undefined;
  return container.dumpLogs();
};

Driver.prototype.updateInstanceEnv = function(instanceId, env, callback) {
  this._containerById(instanceId).updateInstanceEnv(env, callback);
};

Driver.prototype.requestOfInstance = function(instanceId, req, callback) {
  this._containerById(instanceId).request(req, callback);
};

Driver.prototype._containerById = function(instanceId) {
  var container = this._containers[instanceId];

  if (!container) {
    debug('create container for instance %j', instanceId);
    container = this._containers[instanceId] = new this._Container({
      baseDir: this._baseDir,
      console: this._console,
      server: this._server,
      instanceId: instanceId,
    });
    container.on('request', this.emit.bind(this, 'request', instanceId));
  }

  return container;
};

Driver.prototype._onRequest = function(instanceId, req) {
  var instance = this._containerById(instanceId);
  switch (req.cmd) {
    case 'listening':
      // emit a listening event each time a _new_ port is listened on
      var addrKey = addr2str(req.address);
      if (instance.ports.indexOf(addrKey) < 0) {
        instance.ports.push(addrKey);
        this.emit('listening', instanceId, req.address);
      }
  }
};

function addr2str(address) {
  var str;
  if ('address' in address) {
    str = util.format('%s:%d', address.address || '0.0.0.0', address.port);
  } else {
    str = util.format('unix:%s', address);
  }
  return str;
}

Driver.prototype.getName = function() {
  return 'direct-driver';
};

Driver.prototype.getStatus = function() {
  return 'running';
};
