var Environment = require('./env');
var EventEmitter = require('events').EventEmitter;
var assert = require('assert');
var async = require('async');
var cicadaCommit = require('strong-fork-cicada/lib/commit');
var configForCommit = require('./config').configForCommit;
var debug = require('debug')('strong-pm:server');
var fs = require('fs');
var ipcctl = require('./ipcctl');
var loopback = require('loopback');
var loopbackBoot = require('loopback-boot');
var onCtlRequest = require('./ctl').onCtlRequest;
var os = require('os');
var path = require('path');
var prepare = require('./prepare').prepare;
var runner = require('./run');
var setupPushReceiver = require('./receive').setupPushReceiver;
var util = require('util');
var compression = require('compression');
var auth = require('./auth');

// Extend base without modifying it.
function extend(base, extra) {
  return util._extend(util._extend({}, base), extra);
}

function Server(originalCommand, configPath, baseDir, listenPort, controlPath) {
  var self = this;

  this._originalCommand = originalCommand;
  this._configPath = configPath;
  this._baseDir = baseDir;
  this._listenPort = listenPort;
  this._controlPath = controlPath;
  this._app = loopback();
  this._envPath = path.resolve(this._baseDir, 'env.json');
  this._env = null;

  this._app.use(auth(process.env.STRONGLOOP_PM_HTTP_AUTH));

  // Set up the /favicon.ico
  this._app.use(loopback.favicon());

  // request pre-processing middleware
  this._app.use(compression());

  // boot scripts mount components like REST API
  loopbackBoot(this._app, path.join(__dirname, 'server'));

  setupPushReceiver(this, this._baseDir);

  // Requests that get this far won't be handled
  // by any middleware. Convert them into a 404 error
  // that will be handled later down the chain.
  this._app.use(loopback.urlNotFound());

  // The ultimate error handler.
  this._app.use(loopback.errorHandler());

  this._isStarted = false;

  this._app.on('close', function() {
    this._isStarted = false;
  });

  // XXX(sam) rename to 'deploy'
  this.on('commit', function(commit) {
    if (!this._isStarted) return;

    debug('on commit: %j', commit);
    commit.env = this.env();

    commit.config = configForCommit(this._configPath, commit);

    debug('on config: %j', commit.config);

    var self = this;

    prepare(commit, function(err) {
      if (!self._isStarted) return;

      debug('prepare done:', err);

      // XXX ... can I remove the commit?  not much else to do, would be nice
      // if git push could be failed, but I think its too late for that.
      if (err) return;

      self.emit('prepared', commit);
    });
  });

  // Happens after new-deploy is prepared, and also when a previously prepared
  // service is found at startup.
  this.on('prepared', function(commit) {
    if (!this._isStarted) return;

    debug('on prepared: %j', commit);
    runner.run(commit);
  });

  runner.on('request', this._onRunnerRequest.bind(this));
}

util.inherits(Server, EventEmitter);

Server.prototype._onMasterStart = function _onMasterStart(masterInfo, callback) {
  var self = this;
  var current = runner.current();
  var commit = current.commit;

  current.request({cmd: 'status'}, function(status) {
    if (!self._isStarted) return;
    debug('on running: %j', commit);

    current.appName = masterInfo.appName;
    current.agentVersion = masterInfo.agentVersion;

    current.once('exit', function(status) {
      // Sometimes the supervisor process may exit without any events, so we
      // must record its and its childrens death
      self._onRunnerRequest({
        cmd: 'exit',
        id: 0,
        pid: masterInfo.pid,
        reason: status
      });
    });

    // Supervisor does not send a fork for its master process, so we must
    // record it explicitly
    async.series([
      self._onWorkerStart.bind(self, {id: 0, pid: masterInfo.pid}),
      self._updateCommit.bind(self, commit),
      self._updateInstance.bind(self, status, commit)
    ], function(err) {
      if (err) {
        return debug('Error while updating service and instance models', err);
      }
      self.emit('running', commit);
      debug('Service and Instance models updated');
      if (callback) callback();
    });
  });
};

Server.prototype._onWorkerListening = _onWorkerListening;
function _onWorkerListening(pInfo, callback) {
  var Process = this._app.models.ServiceProcess;

  async.waterfall([
    Process.findOne.bind(Process, {
      where: {
        serviceInstanceId: 1,
        pid: +pInfo.pid,
      }
    }),
    updateWorker
  ], function ensureSave(err, _) {
    debug('on listening of %j, save Process: %j', pInfo, err || _);
    assert.ifError(err);
    if (callback) callback(err);
  });

  function updateWorker(proc, asyncCb) {
    if (proc) {
      proc.listeningSockets.push(pInfo.address);
      return proc.save(asyncCb);
    }

    debug('Got listening event for an unknown process: %j', pInfo);
    asyncCb();
  }
}

Server.prototype._onWorkerStart = function _onWorkerStart(pInfo, callback) {
  var Process = this._app.models.ServiceProcess;
  debug('runner forked: id %d pid %d', pInfo.id, pInfo.pid);

  var ppid = runner.current().child.pid;
  if (pInfo.id === 0) {
    ppid = process.pid;
  }

  var proc = new Process({
    pid: pInfo.pid,
    parentPid: ppid,
    workerId: pInfo.id,
    serviceInstanceId: 1,
    startTime: new Date()
  });

  var self = this;
  proc.save(function(err, _) {
    debug('upsert Process: %j', err || _);
    assert.ifError(err);
    self.emit('fork', pInfo);
    if (callback) callback(err);
  });
};

Server.prototype._onWorkerExit = function _onWorkerExit(pInfo, callback) {
  var Process = this._app.models.ServiceProcess;
  debug('runner exited: id %d pid %d reason %s suicide? %s',
    pInfo.id, pInfo.pid, pInfo.reason, pInfo.suicide);

  var self = this;
  async.waterfall([
    Process.findOne.bind(Process, {
      where: {
        serviceInstanceId: 1,
        workerId: +pInfo.id,
        pid: pInfo.pid,
      }
    }),
    updateProcess,
    updateChildren
  ], function ensureSave(err, _) {
    debug('on exit of %j, save Process: %j', pInfo, err || _);
    assert.ifError(err);
    self.emit('exit', pInfo);
    if (callback) callback(err);
  });

  function updateProcess(proc, asyncCb) {
    if (!proc) {
      // Ignore process if it is not in the DB. Defensive coding against race
      // conditions, shouldn't happen, never seen, but lets handle it.
      debug('exit event for an unknown process: %j', pInfo);
      return asyncCb();
    }
    if (proc.stopTime === undefined) {
      proc.stopTime = new Date();
      proc.stopReason = pInfo.reason;
      return proc.save(asyncCb);
    }
    // Found proc, but it was stopped, so nothing to do.
    return asyncCb();
  }

  function updateChildren(proc, asyncCb) {
    // Its possible for the supervisor to die by signal or error before its
    // workers. In this case, the workers will exit, but we won't get any exit
    // event for them, or know the reason. The parent's reason will be applied
    // to the children.

    Process.find({
      where: {
        serviceInstanceId: 1,
        ppid: proc.pid
      }
    }, function(err, childProcs) {
      async.each(childProcs, updateProcess, asyncCb);
    });
  }
};

Server.prototype._onMetrics = function _onMetrics(req, callback) {
  debug('runner metrics: %j', req.metrics);
  var Process = this._app.models.ServiceProcess;
  var Metric = this._app.models.ServiceMetric;

  async.each(Object.keys(req.metrics.processes), saveMetric, function(err) {
    assert.ifError(err);
    deleteOld();
  });

  function saveMetric(wid, asyncCb) {
    var m = req.metrics.processes[wid];
    var q = {where: {serviceInstanceId: 1, workerId: +wid, stopTime: null}};
    Process.findOne(q, function(err, proc) {
      assert.ifError(err);
      if (!proc) {
        debug('Ignoring metrics for unknown worker: %d', wid);
        // Metrics can show up after process death, or perhaps even before
        // supervisor knows they have forked. The timing is a bit
        // uncertain, don't rely on it.
        return asyncCb();
      }
      m.processId = proc.id;
      m.workerId = wid;
      m.timeStamp = req.metrics.timestamp;
      Metric.upsert(m, asyncCb);
    });
  }

  function deleteOld() {
    var now = new Date().getTime();
    var where = {
      timeStamp: {lt: now - 5 * 60 * 1000},
    };
    Metric.destroyAll(where, function(err) {
      assert.ifError(err);
      if (callback) return callback(err);
    });
  }
};

Server.prototype._onRunnerRequest = function _onRunnerRequest(req, callback) {
  debug('Notification: %j', req);
  // Relay notifications to parent process if present
  if (this._parentIpc) {
    var notification = extend(req, {});
    notification.cmd = 'worker-' + notification.cmd;
    if (req.cmd === 'started') {
      var current = runner.current();
      notification.applicationName = current.appName;
      notification.restartCount = current.restartCount;
      notification.agentVersion = current.agentVersion;
    }
    if (req.cmd === 'fork' ) {
      notification.ppid = runner.current().child.pid;
    }

    this._parentIpc.notify(notification);
  }


  // These are all currently notifications, so callback is optional and unused
  // for communicating back to the supervisor. However, the unit tests need to
  // know when models have been updated, so take care to not callback until
  // any actions are complete.
  switch (req.cmd) {
    case 'started':
      return this._onMasterStart(req, callback);
    case 'fork':
      return this._onWorkerStart(req, callback);
    case 'exit':
      return this._onWorkerExit(req, callback);
    case 'status':
      // Unused
      return callback();
    case 'listening':
      return this._onWorkerListening(req, callback);
    case 'metrics': {
      return this._onMetrics(req, callback);
    }
    case 'object-tracking':
    case 'cpu-profiling':
    case 'heap-snapshot':
      return this._onProfileStatusUpdate(req, callback);
    default: {
      debug('runner unknown request: %j', req);
      if (callback) callback();
      break;
    }
  }
};

Server.prototype._onProfileStatusUpdate =
  function _onProfileStatusUpdate(wInfo, callback) {
    var ServiceProcess = this._app.models.ServiceProcess;

    async.waterfall([
      ServiceProcess.findOne.bind(ServiceProcess, {
        serviceInstanceId: 1,
        workerId: wInfo.id,
        pid: wInfo.pid,
      }),
      updateProcessStatus
    ], function(err, proc){
      assert.ifError(err);
      debug('Process entry updated: %j', proc);
      if (callback) callback(err);
    });

    function updateProcessStatus(proc, asyncCb) {
      switch(wInfo.cmd) {
        case 'object-tracking':
          proc.isTrackingObjects = wInfo.isRunning;
          break;
        case 'cpu-profiling':
          proc.isProfiling = wInfo.isRunning;
          proc.watchdogTimeout = wInfo.timeout || 0;
          break;
        case 'heap-snapshot':
          proc.isSnapshotting = wInfo.isRunning;
          break;
      }
      proc.save(asyncCb);
    }
  };

Server.prototype._updateCommit = function _updateCommit(commit, callback) {
  var ServerService = this._app.models.ServerService;

  async.waterfall([
    ServerService.findById.bind(ServerService, 1),
    updateAndSave
  ], function(err){
    assert.ifError(err);
    if (callback) callback(err);
  });

  function updateAndSave(service, asyncCb) {
    service.deploymentInfo = {
      hash: commit.hash,
      dir: commit.dir
    };
    service.save(asyncCb);
  }
};

Server.prototype._updateInstance =
  function _updateInstance(status, newCommit, callback) {
    var m = this._app.models;
    var strongPmInfo = require(path.join(__dirname, '..', 'package.json'));
    var current = runner.current();
    var self = this;
    var tasks = [];

    tasks.push(m.ServiceInstance.findById.bind(m.ServiceInstance, 1));

    // Only run npm-ls if new commit data is available
    if (newCommit) {
      tasks.push(npmLs);
      tasks.push(updateCommitInfo);
    }

    tasks.push(updateStatus);

    async.waterfall(tasks, function(err){
      assert.ifError(err);
      if (callback) callback(err);
    });

    function npmLs(instance, asyncCb) {
      var req = {cmd: 'npm-ls'};
      current.request(req, function(res) {
        if (res.error) {
          return asyncCb(res.error);
        }
        asyncCb(null, instance, res);
      });
    }

    // Update instance information from npm-ls and commit data
    function updateCommitInfo(instance, appInfo, asyncCb) {
      instance.currentDeploymentId = newCommit.hash;
      instance.startTime = new Date();
      instance.started = true;
      instance.applicationName = current.appName;
      instance.npmModules = appInfo;
      asyncCb(null, instance);
    }

    // Update instance information from status updates
    function updateStatus(instance, asyncCb) {
      instance.PMPort = self._listenPort;
      instance.containerVersionInfo = {
        os: {
          platform: os.platform(),
          arch: os.arch(),
          release: os.release()
        },
        node: process.version,
        container: {
          type: 'strong-pm',
          version: strongPmInfo.version
        }
      };
      instance.setSize = status.master.setSize;
      instance.agentVersion = current.agentVersion;
      instance.restartCount = current.restartCount;
      instance.save(asyncCb);
    }
  };

Server.prototype._loadModels = function _loadModels(callback) {
  debug('load models');
  var Executor = this._app.models.Executor;
  var Group = this._app.models.Group;
  var Service = this._app.models.ServerService;
  var Instance = this._app.models.ServiceInstance;

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
    _groups: [ group ],
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
}

Server.prototype.start = function start(cb) {
  debug('start');

  if (typeof cb !== 'function') {
    function cb(){}
  }

  var self = this;

  async.series([
    appListen,
    ipcListen,
    loadModels,
    loadEnv,
    runCurrent,
    emitListeningSignal,
  ], done);

  function appListen(callback) {
    debug('app listen on %d', self._listenPort);
    try {
      self._app.listen(self._listenPort, function(err) {
        if (err) return callback(err);
        self._server = this;
        self._app.runner = runner;
        return callback();
      });
    } catch(err) {
      callback(err);
    }
  }

  function ipcListen(callback) {
    debug('ipcctl listen on `%s`', self._controlPath);
    var ctlOptions = {
      control: self._controlPath,
      app: self,
      runner: self._app.runner,
      config: self._configPath,
      base: self._baseDir
    };
    self._app._ctlRequestListener = onCtlRequest.bind(null, ctlOptions);

    var ctl = ipcctl.start(self._controlPath, self._app._ctlRequestListener);

    self._ipcControl = ctl.local;
    self._parentIpc = ctl.parent;

    if (ctl.parent) {
      // Notify parent process when port is listening
      self.once('listening', function(address) {
        ctl.parent.notify({
          cmd: 'listening',
          port: address.port,
        });
      });
    }

    if (!self._ipcControl) return callback();

    self._ipcControl.on('listening', function() {
      var address = this.address();

      // XXX emit, and let main() log it
      if (address.port) {
        console.log('%s: control listening on port `%s`',
                    self._originalCommand,
                    address.port);
      } else {
        console.log('%s: control listening on path `%s`',
                    self._originalCommand,
                    address.path);
      }
      return callback();
    });
  }

  function loadModels(callback) {
    self._loadModels(callback);
  }

  function loadEnv(callback) {
    debug('loading environment');
    self._env = new Environment(self._envPath);
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

  runner.stop();

  if (this._isStarted) {
    this._isStarted = false;
    return this._server.close(cb);
  }
  process.nextTick(cb);
};

Server.prototype.env = function (baseEnv) {
  return this._env.merged(baseEnv || {});
};

Server.prototype.updateEnv = function (env) {
  debug('Updating environment with: %j', env);
  for (var k in env) {
    debug('Setting env: [%j, %j]', k, env[k]);
    if (env[k] == null) {
      this._env.unset(k);
    } else {
      this._env.set(k, env[k]);
    }
  }
  var self = this;
  this._env.save(function(err) {
    debug('Saved environment: ', arguments);
    var current = runner.current();
    if (current) {
      var commit = cicadaCommit(runner.current().commit);
      commit.config = configForCommit(self._configPath, commit);
      commit.env = self.env();
      debug('Restarting app with new env');
      self.emit('commit', commit);
    } else {
      debug('No current app to restart');
    }
  });
};

// Pass-through functions for loopback application
Server.prototype.use = function use() {
  return this._app.use.apply(this._app, arguments);
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
    commit.config = configForCommit(self._configPath, commit);
    commit.env = self.env();
    self.emit('prepared', commit);
    process.nextTick(cb);
  });
};

Server.prototype.setServiceState = function setServiceState(started, callback) {
  var ServiceInstance = this._app.models.ServiceInstance;
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
