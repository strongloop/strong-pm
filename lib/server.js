var Environment = require('./env');
var EventEmitter = require('events').EventEmitter;
var ServiceManager = require('./service-manager');
var async = require('async');
var auth = require('./auth');
var c2s = require('strong-runner').Runnable.toString;
// XXX(sam) use Container.Runnable?
var cicadaCommit = require('strong-fork-cicada/lib/commit');
var configForCommit = require('./config').configForCommit;
var debug = require('debug')('strong-pm:server');
var express = require('express');
var fs = require('fs');
var http = require('http');
var meshServer = require('strong-mesh-models').meshServer;
var onCtlRequest = require('./ctl').onCtlRequest;
var os = require('os');
var path = require('path');
var prepare = require('./prepare').prepare;
var processChannel = require('strong-control-channel/process');
var Container = require('./container');
var setupPushReceiver = require('./receive').setupPushReceiver;
var util = require('util');
var versionPm = require('../package.json').version;
var versionApi = require('strong-mesh-models/package.json').version;

// Extend base without modifying it.
function extend(base, extra) {
  return util._extend(util._extend({}, base), extra);
}

function Server(cmdName, baseDir, listenPort, controlPath, enableTracing) {
  var self = this;

  this._cmdName = cmdName;
  this._baseDir = baseDir;
  this._listenPort = listenPort;
  this._controlPath = controlPath;
  this._envPath = path.resolve(this._baseDir, 'env.json');
  this._env = new Environment(this._envPath);

  // The express app which the rest of the middleware (mesh-models, deploy
  // receive hooks etc.) are mounted on.
  this._baseApp = express();

  // XXX(sam) I'm a bit torn here... I think Server could derive from
  // ServiceManager and save the bouncing between interfaces
  this._serviceManager = new ServiceManager(this);
  var options = {};
  if (enableTracing) {
    options['trace.enable'] = true;
    options['trace.db.path'] = this._baseDir;
    options['trace.enableDebugServer'] = process.env.STRONGLOOP_DEBUG_MINKELITE;
  }
  this._meshApp = meshServer(this._serviceManager, options);

  this._startOptions = {
    // --cluster=
    size: 'STRONGLOOP_CLUSTER' in process.env ?
      process.env.STRONGLOOP_CLUSTER : 'CPU',
    // --profile/--no-profile
    profile: true,
    // --trace
    trace: enableTracing,
  };

  // XXX(sam) should become map of service ID to Container
  this._container = new Container({
    console: console,
    start: this.getStartCommand(),
    // XXX(sam) for multi-app, may also need:
    //   name: app name
    // or some other identifier, for logging purposes
  });

  this._baseApp.use(auth(process.env.STRONGLOOP_PM_HTTP_AUTH));
  this._baseApp.use(this._meshApp);

  // setup deployment endpoints
  setupPushReceiver(this, this._baseApp, this._baseDir);
  // XXX(sam) would be easier to understand if mounted as middleware:
  // this._baseApp.use(require('./receive')(this, this._baseDir));
  this._isStarted = false;

  // Pass properties to avoid dependencies on private properties.
  var ctlOptions = {
    server: this,
    container: this._container,
    base: this._baseDir,
    models: this._meshApp.models,
  };
  // Control requests come from the mesh server/REST API via ServiceManager, or
  // from the parent via our process control channel.
  // XXX(sam) rename to ._onCtlRequest
  this._ctlRequestListener = onCtlRequest.bind(null, ctlOptions);

  // XXX(sam) rename event to 'deploy'
  // XXX(sam) move function to ._onCommit
  this.on('commit', function(commit) {
    if (!this._isStarted) return;

    debug('on commit: %j', commit);
    commit.env = this.env();

    commit.config = configForCommit(commit);

    debug('on config: %j', commit.config);

    var self = this;

    prepare(commit, function(err) {
      if (!self._isStarted) return;

      debug('prepare done:', err);

      // XXX(sam) ... can I remove the commit?  not much else to do, would be
      // nice if git push could be failed, but I think its too late for that.
      if (err) return;

      self.emit('prepared', commit);
    });
  });

  // Happens after a new-deploy is prepared, and also when a previously prepared
  // service is found at startup.
  // XXX(sam) move function to ._onPrepared
  this.on('prepared', function(commit) {
    if (!this._isStarted) return;

    debug('on prepared: %s', c2s(commit));
    self._container.run(commit);
  });

  // XXX(sam) change to .bind(this, container), and bind to all the containers
  self._container.on('request', this._onContainerRequest.bind(this));
}

util.inherits(Server, EventEmitter);

Server.prototype.setStartOptions = function(options) {
  //console.trace('SET START OPTIONS: %j extend %j', this._startOptions, options);
  util._extend(this._startOptions, options);

  if (this._container) {
    this._container.options.start = this.getStartCommand();
  }
};

Server.prototype.getStartCommand = function() {
  var fmt = util.format;
  var cmd = fmt('sl-run --cluster=%s', this._startOptions.size);
  if (!this._startOptions.profile)
    cmd += ' --no-profile';
  if (this._startOptions.trace)
    cmd += ' --trace';
  return cmd;
};

Server.prototype._onMasterStart =
  function _onMasterStart(supervisorInfo, callback) {
    var self = this;
    var current = this._container.current;
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
        self._onContainerRequest({
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
  };

Server.prototype._onContainerRequest = function(req, callback) {
  debug('Notification: %j', req);

  // Collect additonal data for events. This is required for event bubbled up
  // to parent. It is also used by later steps of notification processing.
  var current = this._container.current;
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
    return this._onMasterStart(req, callback);
  }

  var self = this;
  return this._meshApp.handleModelUpdate(1, req, function(err) {
    if (err) {
      if (callback) return callback(err);
      throw Error(err);
    }

    // Emit events for tests
    if (req.cmd === 'fork' || req.cmd === 'exit') {
      self.emit(req.cmd, req);
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
          self._cmdName,
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
      self._parentIpc = processChannel.attach(self._ctlRequestListener);
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

  // XXX(sam) this stop is async, and takes a cb arg, but that isn't accounted
  // for below, where cb is called after only the server is closed.
  this._container.stop();

  if (this._isStarted) {
    this._isStarted = false;
    return this._server.close(cb);
  }
  process.nextTick(cb);
};

Server.prototype.env = function(baseEnv) {
  return this._env.merged(baseEnv || {});
};

Server.prototype.updateEnv = function(env, callback) {
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
      commit.config = configForCommit(commit);
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

Server.prototype._runCurrent = function _runCurrent(cb) {
  debug('run current deployment');

  // On pm start, bring up the last app to be run as 'current'.
  var currentSymlink = this.git.workdir({id: 'current'});
  var self = this;
  fs.readlink(currentSymlink, function(err, id) {
    if (err) {
      debug('no current deployment found');
      return cb();
    }

    // If we find it, it was already prepared (and run) in the past, so emit
    // it as 'prepared', after figuring out the commit metadata.
    var dir = self.git.workdir({id: id});
    var hash = id.split('.')[0];
    // XXX(sam) repo and branch not known at this point, so config won't be
    // correct!  but config will be gone soon, so we don't care for now.
    var commit = cicadaCommit({hash: hash, id: id, dir: dir});
    commit.config = configForCommit(commit);
    commit.env = self.env();
    self.emit('prepared', commit);
    process.nextTick(cb);
  });
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
