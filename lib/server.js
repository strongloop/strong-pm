'use strict';

var DirectDriver = require('./drivers/direct');
var Environment = require('./env');
var EventEmitter = require('events').EventEmitter;
var MeshServer = require('strong-mesh-models').meshServer;
var MinkeLite = require('minkelite');
var ServiceManager = require('./service-manager');
var assert = require('assert');
var async = require('async');
var auth = require('./auth');
var c2s = require('strong-runner').Runnable.toString;
var debug = require('debug')('strong-pm:server');
var express = require('express');
var fs = require('fs');
var http = require('http');
var mandatory = require('./util').mandatory;
var onCtlRequest = require('./ctl');
var os = require('os');
var path = require('path');
var processChannel = require('strong-control-channel/process');
var util = require('util');
var versionApi = require('strong-mesh-models/package.json').version;
var versionPm = require('../package.json').version;

// Extend base without modifying it.
function extend(base, extra) {
  return util._extend(util._extend({}, base), extra);
}

// Server option defaults.
var OPTIONS = {
  // The injectable dependencies have defaults, but can be customized for unit
  // testing, or to provide alternative implementations (Driver).
  Driver: DirectDriver,
  Environment: Environment,
  MeshServer: MeshServer,
  ServiceManager: ServiceManager,

  // Optional:
  //   baseDir:       Defaults to '.strong-pm'
  //   cmdName:       Defaults to 'sl-pm'
  //   controlPath:   If not present,there will be no control socket
  //   enableTracing: Boolean, defaults to falsy
  //   listenPort:    Defaults to 8701
  //   trace.debugServerPort Minkelite debug server port. Default 8103.
  //   trace.inMemory Persist data in memory rather than on disk. Default false
  //   trace.db.name  DB file name when persisting to disk. Default minkelite.db
  //   trace.data.chartMinutes    Number of minutes of data points shown on the
  //                              Timeline view. Default 1440.
  //   trace.data.staleMinutes    How long (in minutes) to retain data in the
  //                              db. Default 1450.
  //   trace.data.maxTransaction  Number of transactions returned by the
  //                              getTransation API (JS or HTTP). Default 30.
};

function Server(options) {
  options = extend(OPTIONS, options);

  var Driver = mandatory(options.Driver);
  var Environment = mandatory(options.Environment);
  var MeshServer = mandatory(options.MeshServer);
  var ServiceManager = mandatory(options.ServiceManager);

  this._cmdName = options.cmdName || 'sl-pm';
  this._baseDir = path.resolve(options.baseDir || '.strong-pm');
  this._listenPort = 'listenPort' in options ? options.listenPort : 8701;
  this._httpServer = null;
  this._controlPath = options.controlPath;
  this._envPath = path.resolve(this._baseDir, 'env.json');
  this._defaultEnv = new Environment(this._envPath);
  this._driver = new Driver({
    baseDir: this._baseDir,
    console: console,
    server: this,
  });
  var minkelite = null;

  var meshOptions = {};
  if (options.enableTracing) {
    /* eslint-disable camelcase */
    minkelite = new MinkeLite({
      start_server: !!process.env.STRONGLOOP_DEBUG_MINKELITE,
      server_port: options['trace.debugServerPort'] || 8103,

      in_memory: !!options['trace.db.inMemory'],
      db_name: options['trace.db.name'] || 'minkelite.db',
      db_path: this._baseDir,

      // data points shown on the Timeline view
      chart_minutes: parseInt(options['trace.data.chartMinutes'], 10) ||
      1440, // how long we retain data in the db
      stale_minutes: parseInt(options['trace.data.staleMinutes'], 10) || 1450,
      max_transaction_count: parseInt(options['trace.data.maxTransaction'],
        10) || 30
    });
    /* eslint-enable camelcase */
  }

  if (!process.env.STRONGLOOP_MESH_DB) {
    process.env.STRONGLOOP_MESH_DB =
      'memory://' + path.join(this._baseDir, 'strong-pm.json');
  }
  debug('Using STRONGLOOP_MESH_DB=%s', process.env.STRONGLOOP_MESH_DB);

  // Control path must be in the \\pipe\ special filesystem on win32.
  if (this._controlPath) {
    if (process.platform === 'win32' && !/^[\/\\]{2}/.test(this._controlPath))
      this._controlPath = '\\\\?\\pipe\\' + this._controlPath;
  }

  // The express app on which the rest of the middleware is mounted.
  this._baseApp = express();
  this._serviceManager = new ServiceManager(this);
  this._meshApp = MeshServer(this._serviceManager, minkelite, meshOptions);
  this._baseApp.use(auth(process.env.STRONGLOOP_PM_HTTP_AUTH));
  this._baseApp.use(this._meshApp);
  this._baseApp.use(this._serviceManager.handle);
  this._isStarted = false;

  // Pass properties to avoid dependencies on private properties.
  var ctlOptions = {
    server: this,
    base: this._baseDir, // XXX(sam) 'base' should be 'baseDir'
    models: this._meshApp.models, // FIXME should it need this?
  };

  // Control requests come from the mesh server/REST API via ServiceManager, or
  // from the parent via our process control channel.
  // XXX(sam) should probably be a method
  this.onCtlRequest = onCtlRequest.bind(null, ctlOptions);

  this._driver.on('request', this._onInstanceRequest.bind(this));
  this._driver.on('listening', this._onInstanceListening.bind(this));
}

util.inherits(Server, EventEmitter);

Server.prototype.setStartOptions = function(instanceId, options) {
  this._driver.setStartOptions(instanceId, options);
};

Server.prototype.destroyInstance = function(instanceId, callback) {
  var self = this;

  debug('destroy instance %d', instanceId);

  self.stopInstance(instanceId, 'hard', function() {
    self._driver.removeInstance(instanceId, callback);
  });
};

Server.prototype.deployInstance = function(instanceId, req, res) {
  this._driver.deployInstance(instanceId, req, res);
};

// XXX(sam) its not entirely clear to me why we have to set the service state. I
// would expect it to get set as a side-effect of the supervisor starting or
// stopping. Do we do it here to avoid concurrent requests via the mesh models,
// @kraman?
Server.prototype.startInstance = function(instanceId, callback) {
  var self = this;

  self._driver.startInstance(instanceId, function(err) {
    if (err) return callback(err);

    return callback();
    /* FIXME - don't need? and should be `true`?
    self.setServiceState(svcId, false, function(err) {
      assert.ifError(err);
      return callback();
    });
    */
  });
};

Server.prototype.stopInstance = function(instanceId, style, callback) {
  var self = this;

  self._driver.stopInstance(instanceId, style, function(err, status) {
    if (err) return callback(err);

    status = status;
    return callback();
    /*
    self.setServiceState(svcId, false, function(err) {
      assert.ifError(err);
      return callback();
    });
    */
  });
};

Server.prototype.restartInstance = function(instanceId, style, callback) {
  var self = this;

  self.stopInstance(instanceId, style, function(err) {
    if (err) return callback(err);

    self.startInstance(instanceId, callback);
  });
};

Server.prototype.dumpInstanceLog = function(instanceId) {
  return this._driver.dumpInstanceLog(instanceId);
};

Server.prototype.updateInstanceEnv = function(instanceId, env, callback) {
  return this._driver.updateInstanceEnv(instanceId, env, callback);
};

Server.prototype.requestOfInstance = function(instanceId, req, callback) {
  this._driver.requestOfInstance(instanceId, req, callback);
};

// started should be status
// it should be complete (i.e., we don't have to ask again...), so should have
// cluster size, all listening addresses, all worker and master process 3-tuples
// (pid, wid, pst)
//
// it should occur after driver is started for each instance that is restarted
// or found to exist
//
// it should have a 'driverPrivateMeta' field that is COMPLETELY opaque, and
// an object of which (instanceId => driverPrivateMeta) will be given back
// to the driver when it is started
Server.prototype._onInstanceStarted = function(instanceId, startedRequest, cb) {
  var self = this;

  var current = this._driver.instanceById(instanceId);
  var commit = current.commit;

  var strongPmInfo = require('../package.json');

  // XXX(sam) supervisor notifies with status, we don't have to query!
  this._driver.requestOfInstance(instanceId, {cmd: 'status'}, function(status) {
    if (!self._isStarted) return;
    debug('on running: %s', c2s(commit));

    // Process information
    startedRequest.id = 0; // Supervisor is worker id 0
    if (!('ppid' in startedRequest)) {
      startedRequest.ppid = process.pid;
    }

    // startedRequest.commitHash = commit ? commit.hash : undefined;
    startedRequest.PMPort = self._listenPort;
    // XXX(KR): Make sure to update this when factoring into drivers.
    // Specifically, the docker based driver should provide detailed
    // information.
    // XXX(sam) I'm not clear on above... all the info here seems generic to
    // this strong-pm instance... irrespective of what kind of driver is in use!
    startedRequest.containerVersionInfo = {
      os: {
        platform: os.platform(),
        arch: os.arch(),
        release: os.release()
      },
      node: process.version,
      container: {
        type: 'strong-pm',
        version: strongPmInfo.version,
      },
      commit: {
        hash: commit.hash,
        dir: commit.dir,
      },
    };
    startedRequest.commitHash = commit.hash;
    startedRequest.setSize = startedRequest.setSize || status.master.setSize;
    startedRequest.restartCount = current.restartCount;

    self._serviceManager.instanceStarted(
      instanceId,
      startedRequest,
      cb
    );
  });
};

Server.prototype._onInstanceRequest = function(instanceId, req, callback) {
  var self = this;

  debug('Notification for %s: %j', instanceId, req);

  // Collect additonal data for events. This is required for event bubbled up
  // to parent. It is also used by later steps of notification processing.
  // XXX(sam) seems like this code should be in either Container, or in
  // strong-supervisor?

  var current = this._driver.instanceById(instanceId);
  if (req.cmd === 'started') {
    current.appName = req.appName;
    current.agentVersion = req.agentVersion;
    req.restartCount = current.restartCount;
  } else if (req.cmd === 'fork') {
    req.ppid = current.pid;
  }

  // Relay notifications to parent process if present
  if (self._parentIpc) {
    var notification = extend(req, {});
    notification.cmd = 'worker-' + notification.cmd;
    self._parentIpc.notify(notification);
  }

  if (req.cmd === 'started') {
    // Collect additional container and app info for model updates
    return self._onInstanceStarted(instanceId, req, function(err) {
      assert.ifError(err);
      // XXX(sam) for test code? used anywhere?
      self.emit('running', current.commit);
      if (callback) return callback();
    });
  }

  return self._meshApp.handleModelUpdate(instanceId, req, function(err) {
    assert.ifError(err);
    // used for test/test-server-metadata.js
    if (req.cmd === 'exit') {
      self.emit(req.cmd, req);
    }
    if (callback) {
      return callback();
    }
  });
};

Server.prototype._onInstanceListening = function(instanceId, address) {
  console.log('%s: Service "%s" listening on %s:%d', this._cmdName,
              instanceId, address.address, address.port);
};

Server.prototype.start = function start(cb) {
  debug('start');

  if (typeof cb !== 'function') {
    cb = function() {};
  }

  var self = this;

  async.series([
    appListen,
    ctlListen,
    parentIpcListen,
    initOrUpdateDb,
    startDriver,
    emitListeningSignal,
  ], done);

  function appListen(callback) {
    debug('Initializing http listen on port %d', self._listenPort);
    try {
      http.createServer(self._baseApp).listen(self._listenPort, function(err) {
        if (err) return callback(err);

        var address = this.address();
        console.log('%s: StrongLoop PM v%s (API v%s) listening on port `%s`',
          self._cmdName,
          versionPm,
          versionApi,
          address.port);

        // The HTTP server. This is used when stopping PM and to get the address
        // that PM is listening on
        self._httpServer = this;
        self._started = true;
        return callback();
      });
    } catch (err) {
      callback(err);
    }
  }

  function ctlListen(callback) {
    try {
      if (!self._controlPath) return callback();
      debug('Initializing control socket on %s', self._controlPath);

      // XXX(sam) I don't like this 'last one wins' approach, but its impossible
      // to prevent the channel outliving the server under all conditions, this
      // is the only robust way I've found.
      try {
        fs.unlinkSync(self._controlPath);
      } catch (er) {
        /* eslint no-empty: 0 */
        // Didn't exist
      }

      self._ipcControl = http.createServer(self._baseApp);
      self._ipcControl.unref();

      self._ipcControl.listen(self._controlPath, function(err) {
        if (err) return callback(err);

        var address = this.address();
        console.log(
          '%s: control listening on path `%s`',
          self._cmdName, address
        );
        return callback();
      });
    } catch (err) {
      callback(err);
    }
  }

  function parentIpcListen(callback) {
    if (process.send) {
      // XXX(sam) for the IPC messages... serviceId is now a mandatory field?
      // XXX(sam) this was only ever used by arc, and Krishna thinks it isn't
      // used at all now. We may be able to delete, but must confirm.
      self._parentIpc = processChannel.attach(self.onCtlRequest);
      self.once('listening', function(address) {
        self._parentIpc.notify({
          cmd: 'listening',
          port: address.port,
        });
      });
    }
    callback();
  }

  function initOrUpdateDb(callback) {
    self._serviceManager.initOrUpdateDb(self._meshApp, callback);
  }

  function startDriver(callback) {
    debug('starting driver');
    // XXX(sam) _driver knows if it is started, that doesn't have to be kept in
    // the server
    self._isStarted = true;

    self._serviceManager.getInstanceMetas(function(err, instanceMetas) {
      if (err) return callback(err);

      self._driver.start(instanceMetas, callback);
    });
  }

  function emitListeningSignal(serialCb) {
    debug('emitting listening event');
    self.emit('listening', self._httpServer.address());
    process.nextTick(serialCb);
  }

  function done(err) {
    if (!err) return cb();

    console.error('Listening failed with: %s', err.message);
    self.stop();
    self.emit('error', err);
    cb(err);
  }
};

Server.prototype.stop = function stop(cb) {
  debug('stop');
  var shutdownTasks = [];
  var self = this;

  if (this._ipcControl) {
    shutdownTasks.push(function(next) {
      self._ipcControl.close(next);
      self._ipcControl = null;
    });
  }

  if (this._driver) {
    shutdownTasks.push(this._driver.stop.bind(this._driver));
  }

  if (this._isStarted) {
    shutdownTasks.push(function(next) {
      // XXX(sam) wrong variable... currently set when driver is started, not
      // when http server listens!
      self._isStarted = false;
      return self._httpServer.close(next);
    });
  }

  async.series(shutdownTasks, cb);
};

Server.prototype.getInstanceEnv = function(instanceId, callback) {
  this._serviceManager.getInstanceEnv(instanceId, callback);
};

Server.prototype.getDefaultEnv = function() {
  return this._defaultEnv.all();
};

Server.prototype.port = function port() {
  return this._httpServer.address().port;
};

// FIXME unused? problem?
Server.prototype.setServiceState = function(svcId, started, callback) {
  this._serviceManager.setServiceState(svcId, started, callback);
};

Server.prototype.getDriverInfo = function() {
  return {
    type: this._driver.getName(),
    status: this._driver.getStatus(),
  };
};

module.exports = Server;
