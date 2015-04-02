var Environment = require('./env');
var EventEmitter = require('events').EventEmitter;
var ServiceManager = require('./service-manager');
var assert = require('assert');
var async = require('async');
var auth = require('./auth');
var c2s = require('strong-runner').Runnable.toString;
// XXX(sam) use Container.Runnable?
var cicadaCommit = require('strong-fork-cicada/lib/commit');
var debug = require('debug')('strong-pm:server');
var express = require('express');
var fs = require('fs');
var http = require('http');
var meshServer = require('strong-mesh-models').meshServer;
var onCtlRequest = require('./ctl').onCtlRequest;
var os = require('os');
var path = require('path');
var processChannel = require('strong-control-channel/process');
var Container = require('./container');
var util = require('util');
var versionPm = require('../package.json').version;
var versionApi = require('strong-mesh-models/package.json').version;

// Extend base without modifying it.
function extend(base, extra) {
  return util._extend(util._extend({}, base), extra);
}

function Server(originalCommand, baseDir, listenPort, controlPath) {
  this._originalCommand = originalCommand;
  this._baseDir = baseDir;
  this._listenPort = listenPort;
  this._controlPath = controlPath;
  this._envPath = path.resolve(this._baseDir, 'env.json');
  this._env = new Environment(this._envPath);
  this._containers = Object.create(null);

  // The express app which the rest of the middleware (mesh-models, deploy
  // receive hooks etc.) are mounted on.
  this._baseApp = express();

  this._serviceManager = new ServiceManager(this);
  this._meshApp = meshServer(this._serviceManager);

  this._baseApp.use(auth(process.env.STRONGLOOP_PM_HTTP_AUTH));
  this._baseApp.use(this._meshApp);

  this._isStarted = false;

  // Pass properties to avoid dependencies on private properties.
  var ctlOptions = {
    server: this,
    containers: this._containers,
    base: this._baseDir,
    models: this._meshApp.models,
  };
  // Control requests come from the mesh server/REST API via ServiceManager, or
  // from the parent via our process control channel.
  this._onCtlRequest = onCtlRequest.bind(null, ctlOptions);

  // Happens after a new-deploy is prepared, and also when a previously prepared
  // service is found at startup.
  this.on('prepared', this._onPrepared);
}

util.inherits(Server, EventEmitter);

Server.prototype.containerById = function(svcId) {
  var container = this._containers[svcId];

  if (!container) {
    debug('create container for service %j', svcId);
    container = this._containers[svcId] = new Container({
      baseDir: this._baseDir,
      console: console,
      server: this,
      serviceId: svcId,
    });
    container.on('request', this._onContainerRequest.bind(this, container));
  }

  return container;
};

Server.prototype.setStartOptions = function(svcId, options) {
  this.containerById(svcId).setStartOptions(options);
};

Server.prototype.onDeployment = function(service, req, res) {
  this.containerById(service.id).onDeployment(req, res);
};

Server.prototype._onPrepared = function(commit, container) {
  if (!this._isStarted) return;

  debug('on prepared: %s', c2s(commit));
  assert(container);
  container.run(commit);
};

Server.prototype._onMasterStart =
  function _onMasterStart(container, supervisorInfo, callback) {
    var self = this;
    var current = container.current;
    var commit = current.commit;
    var strongPmInfo = require('../package.json');

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

      // XXX(sam) this info can be unreasonably large... we should not collect
      // it except on demand.
      var req = {cmd: 'npm-ls'};
      current.request(req, function(appInfo) {
        if (appInfo.error) {
          return callback(Error(appInfo.error));
        }

        // Process information
        supervisorInfo.id = 0; // Supervisor is worker id 0
        supervisorInfo.ppid = process.pid;

        // Instance information
        supervisorInfo.commitHash = commit ? commit.hash : undefined;
        supervisorInfo.npmModules = appInfo;
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
          if (err) return callback(err);
          self._meshApp.handleModelUpdate(1,
            supervisorInfo,
            function(err) {
              if (err) return callback(err);

              self.emit('running', commit);
              callback();
            });
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
    return this._onMasterStart(container, req, callback);
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
  debug('load models');
  var Executor = this._meshApp.models.Executor;
  var Group = this._meshApp.models.Group;
  var Service = this._meshApp.models.ServerService;
  var Instance = this._meshApp.models.ServiceInstance;

  var executor = new Executor({
    id: 1,
    address: 'localhost',
    APIPort: this._listenPort,
  });

  var group = new Group({
    id: 1,
    name: 'default',
    scale: 1,
  });

  var service = new Service({
    id: 1,
    name: 'default',
    _groups: [group],
    env: this.env(),
  });

  var instance = new Instance({
    id: 1,
    executorId: 1,
    serverServiceId: 1,
    groupId: 1,
    cpus: 'CPU',
  });

  async.parallel([
    executor.save.bind(executor),
    group.save.bind(group),
    service.save.bind(service),
    instance.save.bind(instance),
  ], callback);
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
    runCurrent,
    emitListeningSignal,
  ], done);

  function appListen(callback) {
    debug('Initializing http listen on port %d', self._listenPort);
    try {
      http.createServer(self._baseApp).listen(self._listenPort, function(err) {
        if (err) return callback(err);

        var address = this.address();
        console.log('%s: StrongLoop PM v%s (API v%s) listening on port `%s`',
          self._originalCommand,
          versionPm,
          versionApi,
          address.port);

        // The HTTP server. This is used when stopping PM and to get the address
        // that PM is listening on
        self._server = this;
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
          self._originalCommand, address
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

  function runCurrent(callback) {
    self._isStarted = true;
    self._runCurrent(callback);
  }

  function emitListeningSignal(serialCb) {
    debug('emitting listening event');
    self.emit('listening', self._server.address());
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

  // XXX(sam) container stop is async, and takes a cb arg, but that isn't
  // accounted for below, where cb is called after only the server is closed.
  for (var svcId in this._containers) {
    this._containers[svcId].stop();
  }

  if (this._isStarted) {
    this._isStarted = false;
    return this._server.close(cb);
  }
  process.nextTick(cb);
};

Server.prototype.env = function(baseEnv) {
  return this._env.merged(baseEnv || {});
};

Server.prototype.updateEnv = function(service, env, callback) {
  debug('Updating environment with: %j', env);
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
    var current = self._container.current;
    if (current) {
      // make copy of current app but with an updated environment
      var commit = cicadaCommit(current.commit);
      commit.env = self.env();
      debug('Restarting app with new env');
      self.emit('commit', commit);
    } else {
      debug('No current app to restart');
    }
    if (callback) {
      callback();
    }
  });
};

Server.prototype.port = function port() {
  return this._server.address().port;
};

// On pm start, bring up the last app to be run as 'current'.
Server.prototype._runCurrent = function _runCurrent(callback) {
  debug('re-start current deployments');

  //var self = this;

  // FIXME won't work! there are no containers until services are created,
  // we will have to search the file-system, determine svcId from disk,
  // and create those services.
  return callback();
  /*
  async.each(Object.keys(self._containers), run, function(err) {
    assert.ifError(err);
    return callback();
  });

  // This should be a method of Container/Driver
  function run(svcId, cb) {
    var container = self._containers[svcId];
    var currentSymlink = container.git.workdir({id: 'current'});
    fs.readlink(currentSymlink, function(err, id) {
      if (err) {
        debug('no current deployment found');
        return cb();
      }

      // If we find it, it was already prepared (and run) in the past, so emit
      // it as 'prepared', after figuring out the commit metadata.
      var dir = container.git.workdir({id: id});
      var hash = id.split('.')[0];
      var commit = cicadaCommit({hash: hash, id: id, dir: dir});
      commit.env = self.env();
      commit.container = container;
      self.emit('prepared', commit, container);
      process.nextTick(cb);
    });
  }
  */
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
