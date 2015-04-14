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

Driver.prototype.containers = function() {
  return this._containers;
};

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
    this._containers[svcId].stop('hard');
  }
  // XXX(sam) container stop is async, but the server doesn't care, ATM, so
  // don't bother waiting.
  if (callback) process.nextTick(callback);
};

Driver.prototype.setStartOptions = function(svcId, options) {
  this._containerById(svcId).setStartOptions(options);
};

Driver.prototype.deployService = function(svcId, req, res) {
  this._containerById(svcId).onDeployment(req, res);
};

Driver.prototype.startService = function(svcId, callback) {
  debug('start service %d', svcId);
  this._containerById(svcId).start(callback);
};

Driver.prototype.stopService = function(svcId, style, callback) {
  debug('stop service %d (%s)', svcId, style);
  this._containerById(svcId).stop(style, callback);
};

Driver.prototype.removeService = function(svcId, callback) {
  var container = this._containers[svcId];

  debug('remove service %d exists? %j', svcId, !!container);

  if (!container)
    return setImmediate(callback);

  delete this._containers[svcId];

  container.remove(callback);
};

Driver.prototype.dumpServiceLog = function(svcId) {
  var container = this._containerById(svcId);
  var log = container.readableLogSnapshot().toString();
  var logLength = log === null ? undefined : log.length;
  var current = !!container.current;
  var child = container ? !!container.current.child : undefined;

  container.flushLogs();

  debug('dumpServiceLog(%j) size: %j current? %j child? %j',
        svcId, logLength, current, child);

  // Distinguish between no log data because there is no data, and no log
  // data because there is no running child by setting log data to empty
  // string.
  /* eslint eqeqeq:0 */
  if (log == '' && !child) {
    log = null;
  }
  if (log == null && child) {
    log = '';
  }

  return log;
};

Driver.prototype.updateEnv = function(svcId, env) {
  this._containerById(svcId).updateEnv(env);
};

Driver.prototype.requestOfService = function(svcId, req, callback) {
  this._containerById(svcId).request(req, callback);
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
