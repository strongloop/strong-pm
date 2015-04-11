var DirectDriver = require('./direct-driver');
var Environment = require('./env');
var EventEmitter = require('events').EventEmitter;
var ServiceManager = require('./service-manager');
// var assert = require('assert');
var async = require('async');
var auth = require('./auth');
var c2s = require('strong-runner').Runnable.toString;
var debug = require('debug')('strong-pm:server');
var express = require('express');
var fs = require('fs');
var http = require('http');
var meshServer = require('strong-mesh-models').meshServer;
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

function Server(cmdName, baseDir, listenPort, controlPath, enableTracing) {
  // Choose driver based on cli options/env once we have alternate drivers.
  var Driver = DirectDriver;

  this._cmdName = cmdName;
  this._baseDir = baseDir;
  this._listenPort = listenPort;
  this._httpServer = null;
  this._controlPath = controlPath;
  this._envPath = path.resolve(this._baseDir, 'env.json');
  // XXX(sam) _env needs to be tracked per-svcId!
  this._env = new Environment(this._envPath);
  this._driver = new Driver({
    baseDir: this._baseDir,
    console: console,
    server: this,
  });
  var options = {};

  if (enableTracing) {
    options['trace.enable'] = true;
    options['trace.db.path'] = this._baseDir;
    options['trace.enableDebugServer'] = process.env.STRONGLOOP_DEBUG_MINKELITE;
  }

  // The express app on which the rest of the middleware is mounted.
  this._baseApp = express();
  this._serviceManager = new ServiceManager(this);
  this._meshApp = meshServer(this._serviceManager, options);
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
  this._onCtlRequest = onCtlRequest.bind(null, ctlOptions);

  this._driver.on('request', this._onContainerRequest.bind(this));
}

util.inherits(Server, EventEmitter);

Server.prototype.setStartOptions = function(svcId, options) {
  this._driver.setStartOptions(svcId, options);
};

Server.prototype.onDeployment = function(service, req, res) {
  this._driver.onDeployment(service.id, req, res);
};

// XXX(sam) the collection of the json describing the supervisor and the
// 'commit' should be in Driver, the persisting into the models should be here.
// And the npm-ls will be gone after rebase.
Server.prototype._onContainerStart = function(container, supervisorInfo, cb) {
  var self = this;
  var current = container.current;
  var commit = current.commit;
  var strongPmInfo = require('../package.json');

  // XXX(sam) supervisor notifies status changes, we shouldn't have to query,
  // perhaps we should just wait for the status notification? Or perhaps
  // the 'started' request should be handled in direct-driver, and emitted
  // as a 'started' event, containing all this information in it? That sounds
  // better.
  current.request({cmd: 'status'}, function(status) {
    if (!self._isStarted) return;
    debug('on running: %s', c2s(commit));

    var supervisorPid = supervisorInfo.pid;
    current.once('exit', function(status) {
      // Sometimes the supervisor process may exit without any events, so we
      // must record its and its childrens death by simulating an exit
      // request.
      self._onContainerRequest(container, {
        cmd: 'exit', id: 0, pid: supervisorPid, reason: status
      });
    });

    // Process information
    supervisorInfo.id = 0; // Supervisor is worker id 0
    supervisorInfo.ppid = process.pid;

    // Instance information
    supervisorInfo.commitHash = commit ? commit.hash : undefined;
    supervisorInfo.PMPort = self._listenPort;
    // XXX(KR): Make sure to update this when factoring into drivers.
    // Specifically, the docker based driver should provide detailed
    // information.
    supervisorInfo.containerVersionInfo = {
      os: {
        platform: os.platform(),
        arch: os.arch(),
        release: os.release()
      },
      node: process.version,
      container: {
        type: 'strong-pm',
        version: strongPmInfo.version
      },
    };
    supervisorInfo.setSize = status.master.setSize;
    supervisorInfo.restartCount = current.restartCount;

    self._meshApp.setServiceCommit(1, {
      hash: commit.hash, dir: commit.dir
    }, function(err) {
      if (err) return cb(err);
      self._meshApp.handleModelUpdate(1, supervisorInfo, function(err) {
        if (err) return cb(err);

        self.emit('running', commit);
        cb();
      });
    });
  });
};

Server.prototype._onContainerRequest = function(container, req, callback) {
  debug('Notification: %j', req);

  // Collect additonal data for events. This is required for event bubbled up
  // to parent. It is also used by later steps of notification processing.
  var current = container.current;
  if (req.cmd === 'started') {
    current.appName = req.appName;
    current.agentVersion = req.agentVersion;
    req.ppid = process.pid;
    req.restartCount = current.restartCount;
  } else if (req.cmd === 'fork') {
    req.ppid = current.child.pid;
  }

  // Relay notifications to parent process if present
  if (this._parentIpc) {
    var notification = extend(req, {});
    notification.cmd = 'worker-' + notification.cmd;
    this._parentIpc.notify(notification);
  }

  if (req.cmd === 'started') {
    // Collect additional container and app info for model updates
    return this._onContainerStart(container, req, callback);
  }

  var self = this;
  return this._meshApp.handleModelUpdate(container.svcId, req, function(err) {
    if (err) {
      if (callback) return callback(err);
      throw Error(err);
    }

    // Emit events for tests
    if (req.cmd === 'fork' || req.cmd === 'exit') {
      self.emit(req.cmd, req, container);
    }
    if (callback) callback();
  });
};

Server.prototype._loadModels = function _loadModels(callback) {
  this._serviceManager.loadModels(this._meshApp.models, callback);
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
      self._parentIpc = processChannel.attach(self._onCtlRequest);
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
    self._loadModels(callback);
  }

  function saveEnv(callback) {
    debug('persisting environment');
    self._env.save(callback);
  }

  function startDriver(callback) {
    debug('starting driver');
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
  debug('Server::stop');
  if (this._ipcControl) {
    this._ipcControl.close();
    this._ipcControl = null;
  }

  if (this._driver) {
    // XXX(sam) internally async, but we don't care?
    this._driver.stop();
  }

  if (this._isStarted) {
    this._isStarted = false;
    return this._httpServer.close(cb);
  }
  process.nextTick(cb);
};

Server.prototype.env = function(svcId, baseEnv) {
  svcId = svcId; // FIXME per-svc env
  return this._env.merged(baseEnv || {});
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

Server.prototype.setServiceState = function setServiceState(started, callback) {
  var ServiceInstance = this._meshApp.models.ServiceInstance;
  ServiceInstance.findOne(function(err, instance) {
    if (err) {
      debug(err);
      return callback(Error('Unable to modify service state'));
    }

    instance.started = started;
    instance.save(function(err) {
      if (err) {
        debug(err);
        return callback(Error('Unable to modify service state'));
      }
      callback();
    });
  });
};

module.exports = Server;
