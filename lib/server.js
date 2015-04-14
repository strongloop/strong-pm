'use strict';

var Environment = require('./env');
var EventEmitter = require('events').EventEmitter;
var MeshServer = require('strong-mesh-models').meshServer;
var ServiceManager = require('./service-manager');
var assert = require('assert');
var async = require('async');
var auth = require('./auth');
var c2s = require('strong-runner').Runnable.toString;
var debug = require('debug')('strong-pm:server');
var express = require('express');
var fs = require('fs');
var http = require('http');
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

var OPTIONS = {
  Environment: Environment,
  MeshServer: MeshServer,
  ServiceManager: ServiceManager,
};

function Server(options) {
  options = extend(OPTIONS, options);

  var Driver = options.Driver;
  var Environment = options.Environment;
  var MeshServer = options.MeshServer;
  var ServiceManager = options.ServiceManager;

  this._cmdName = options.cmdName;
  this._baseDir = options.baseDir;
  this._listenPort = options.listenPort;
  this._httpServer = null;
  this._controlPath = options.controlPath;
  this._envPath = path.resolve(this._baseDir, 'env.json');
  // XXX(sam) _env needs to be tracked per-svcId!
  this._env = new Environment(this._envPath);
  this._driver = new Driver({
    baseDir: this._baseDir,
    console: console,
    server: this,
  });
  var meshOptions = {};

  if (options.enableTracing) {
    meshOptions['trace.enable'] = true;
    meshOptions['trace.db.path'] = this._baseDir;
    meshOptions['trace.enableDebugServer'] =
      process.env.STRONGLOOP_DEBUG_MINKELITE;
  }

  // The express app on which the rest of the middleware is mounted.
  this._baseApp = express();
  this._serviceManager = new ServiceManager(this);
  this._meshApp = MeshServer(this._serviceManager, meshOptions);
  this._baseApp.use(auth(process.env.STRONGLOOP_PM_HTTP_AUTH));
  this._baseApp.use(this._meshApp);
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

  this._driver.on('request', this._onContainerRequest.bind(this));
}

util.inherits(Server, EventEmitter);

Server.prototype.setStartOptions = function(svcId, options) {
  this._driver.setStartOptions(svcId, options);
};

Server.prototype.destroyService = function(svcId, callback) {
  var self = this;

  debug('destroy service %d', svcId);

  self.stopService(svcId, 'hard', function() {
    self._driver.removeService(svcId, callback);
  });
};

Server.prototype.deployService = function(service, req, res) {
  this._driver.deployService(service.id, req, res);
};

// XXX(sam) its not entirely clear to me why we have to set the service state. I
// would expect it to get set as a side-effect of the supervisor starting or
// stopping. Do we do it here to avoid concurrent requests via the mesh models,
// @kraman?
Server.prototype.startService = function(svcId, callback) {
  var self = this;

  self._driver.startService(svcId, function(err) {
    if (err) return callback(err);

    self.setServiceState(svcId, true, function(err) {
      assert.ifError(err);
      return callback();
    });
  });
};

Server.prototype.stopService = function(svcId, style, callback) {
  var self = this;

  self._driver.stopService(svcId, style, function(err, status) {
    if (err) return callback(err);

    self.setServiceState(svcId, false, function(err) {
      assert.ifError(err);
      return callback(null, status);
    });
  });
};

Server.prototype.restartService = function(svcId, style, callback) {
  var self = this;

  self.stopService(svcId, style, function(err) {
    if (err) return callback(err);

    self.startService(svcId, callback);
  });
};

Server.prototype.dumpServiceLog = function(svcId) {
  return this._driver.dumpServiceLog(svcId);
};

Server.prototype.setServiceEnv = function(svcId, env, callback) {
  // XXX(sam) I think the model interactions would be better done in a public
  // method of lib/service-manager.js

  // If the env hasn't actually changed this is a soft reload.  If the env has
  // changed, it does a hard restart.
  var models = this._meshApp.models;
  var Service = models.ServerService;
  Service.findById(1, function(err, svc) {
    if (err) {
      return callback({error: err});
    }
    var k;
    for (k in env) {
      if (env[k] === null) {
        delete svc.env[k];
      } else {
        svc.env[k] = env[k];
      }
    }
    svc.save(function(err) {
      if (err) {
        return callback({error: err});
      }
      callback({message: 'Updated environment, restarting app'});
      // XXX(sam) uhm... where does the restart happen?
    });
  });
};

Server.prototype.requestOfService = function(svcId, req, callback) {
  this._driver.requestOfService(svcId, req, callback);
};

Server.prototype.containers = function() {
  return this._driver.containers();
};

Server.prototype._onContainerStarted = function(container, startedRequest, cb) {
  var self = this;
  var current = container.current;
  var commit = current.commit;
  var strongPmInfo = require('../package.json');

  // XXX(sam) supervisor notifies with status, we don't have to query!
  current.request({cmd: 'status'}, function(status) {
    if (!self._isStarted) return;
    debug('on running: %s', c2s(commit));

    var supervisorPid = startedRequest.pid;
    // XXX should be in driver, and maybe be a 'stopped' event?
    current.once('exit', function(status) {
      // Sometimes the supervisor process may exit without any events, so we
      // must record its and its childrens death by simulating an exit
      // request.
      self._onContainerRequest(container, {
        cmd: 'exit', id: 0, pid: supervisorPid, reason: status
      }, function() {});
    });

    // Process information
    startedRequest.id = 0; // Supervisor is worker id 0
    startedRequest.ppid = process.pid;

    // Instance information
    startedRequest.commitHash = commit ? commit.hash : undefined;
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
    startedRequest.setSize = status.master.setSize;
    startedRequest.restartCount = current.restartCount;

    self._serviceManager.containerStarted(container.svcId, startedRequest, cb);
  });
};

Server.prototype._onContainerRequest = function(container, req, callback) {
  var self = this;

  debug('Notification: %j', req);

  // Collect additonal data for events. This is required for event bubbled up
  // to parent. It is also used by later steps of notification processing.
  // XXX(sam) seems like this code should be in either Container, or in
  // strong-supervisor?
  var current = container.current;
  if (req.cmd === 'started') {
    current.appName = req.appName;
    current.agentVersion = req.agentVersion;
    req.ppid = process.pid;
    req.restartCount = current.restartCount;
  } else if (req.cmd === 'fork') {
    req.ppid = container.current.child.pid;
  }

  // Relay notifications to parent process if present
  if (self._parentIpc) {
    var notification = extend(req, {});
    notification.cmd = 'worker-' + notification.cmd;
    self._parentIpc.notify(notification);
  }

  if (req.cmd === 'started') {
    // Collect additional container and app info for model updates
    return self._onContainerStarted(container, req, function(err) {
      assert.ifError(err);
      // XXX(sam) for test code? used anywhere?
      self.emit('running', container.current.commit);
      return callback();
    });
  }

  return self._meshApp.handleModelUpdate(container.svcId, req, function(err) {
    assert.ifError(err);

    // Emit events for tests
    // XXX might not be needed after test refactor
    if (req.cmd === 'fork' || req.cmd === 'exit') {
      self.emit(req.cmd, req, container);
    }

    return callback();
  });
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
    loadModels,
    saveEnv,
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

  function loadModels(callback) {
    self._serviceManager.loadModels(self._meshApp, callback);
  }

  function saveEnv(callback) {
    debug('persisting environment');
    self._env.save(callback);
  }

  function startDriver(callback) {
    debug('starting driver');
    // XXX(sam) _driver knows if it is started, that doesn't have to be kept in
    // the server
    self._isStarted = true;
    self._driver.start(callback);
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
  if (this._ipcControl) {
    this._ipcControl.close();
    this._ipcControl = null;
  }

  if (this._driver) {
    // XXX(sam) internally async, but we don't care?
    this._driver.stop();
  }

  if (this._isStarted) {
    // XXX(sam) wrong variable... currently set when driver is started, not when
    // http server listens!
    this._isStarted = false;
    return this._httpServer.close(cb);
  }
  process.nextTick(cb);
};

Server.prototype.env = function(svcId, baseEnv) {
  svcId = svcId; // FIXME per-svc env
  var env = this._env.merged(baseEnv || {});

  // XXX(sam) could probably be done better elsewhere, perhaps ports should
  // be allocated, then assigned at time of instance creation? But this is
  // simple and robust.
  env.PORT = 3000 + Number(svcId);
  return env;
};

Server.prototype.updateEnv = function(svcId, env, callback) {
  debug('Updating environment for %j with: %j', svcId, env);
  // FIXME per-svc env!
  this._env.apply(env);
  var self = this;
  this._env.save(function(err) {
    debug('Saved environment: ', arguments);
    if (err) {
      if (callback) {
        return callback(err);
      } else {
        throw err;
      }
    }
    self._driver.updateEnv(svcId, self.env(svcId));
    if (callback) {
      callback();
    }
  });
};

Server.prototype.port = function port() {
  return this._httpServer.address().port;
};

Server.prototype.setServiceState = function(svcId, started, callback) {
  this._serviceManager.setServiceState(svcId, started, callback);
};

module.exports = Server;
