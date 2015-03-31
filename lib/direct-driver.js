// XXX(sam) should this be a seperate module? Maybe not necessary if we keep its
// interface very clear.
'use strict';

var Container = require('./container');
var EventEmitter = require('events').EventEmitter;
var assert = require('assert');
var async = require('async');
var debug = require('debug')('strong-pm:direct-driver');
var fs = require('fs');
var mandatory = require('./util').mandatory;
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
Driver.prototype.start = function(callback) {
  var self = this;
  var svcBase = path.resolve(this._baseDir, 'svc');

  debug('start: svcBase %j', svcBase);

  try {
    var svcIds = fs.readdirSync(svcBase);
  } catch (er) {
    /* eslint */
    return callback();
  }

  debug('start: current services %j', svcIds);

  async.each(svcIds, run, function(err) {
    assert.ifError(err);
    return callback();
  });

  function run(svcId, callback) {
    debug('start current for service %j', svcId);
    self._containerById(svcId).runCurrent(callback);
  }

  return this;
};

Driver.prototype.stop = function(callback) {
  for (var svcId in this._containers) {
    debug('stopping service %j', svcId);
    this._containers[svcId].stop();
  }
  // XXX(sam) container stop is async, but the server doesn't care, ATM, so
  // don't bother waiting.
  if (callback) process.nextTick(callback);
};

Driver.prototype.setStartOptions = function(svcId, options) {
  this._containerById(svcId).setStartOptions(options);
};

Driver.prototype.onDeployment = function(svcId, req, res) {
  this._containerById(svcId).onDeployment(req, res);
};

Driver.prototype.updateEnv = function(svcId, env) {
  this._containerById(svcId).updateEnv(env);
};

Driver.prototype._containerById = function(svcId) {
  var container = this._containers[svcId];

  if (!container) {
    debug('create container for service %j', svcId);
    container = this._containers[svcId] = new this._Container({
      baseDir: this._baseDir,
      console: this._console,
      server: this._server,
      svcId: svcId,
    });
    container.on('request', this.emit.bind(this, 'request', container));
  }

  return container;
};
