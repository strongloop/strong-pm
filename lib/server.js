var Environment = require('./env');
var EventEmitter = require('events').EventEmitter;
var assert = require('assert');
var async = require('async');
var cicadaCommit = require('cicada/lib/commit');
var configForCommit = require('./config').configForCommit;
var debug = require('debug')('strong-pm:server');
var fs = require('fs');
var ipcctl = require('./ipcctl');
var loopback = require('loopback');
var loopbackBoot = require('loopback-boot');
var onCtlRequest = require('./ctl').onCtlRequest;
var path = require('path');
var prepare = require('./prepare').prepare;
var runner = require('./run');
var setupPushReceiver = require('./receive').setupPushReceiver;
var util = require('util');

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

  // Set up the /favicon.ico
  this._app.use(loopback.favicon());

  // request pre-processing middleware
  this._app.use(loopback.compress());

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

    debug('on commit:', commit);
    commit.env = this.env(process.env);

    commit.config = configForCommit(this._configPath, commit);

    debug('on config:', commit.config);

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

    debug('on prepared:', commit);
    runner.run(commit);
    this.emit('running', commit);
  });

  this.on('running', function(commit) {
    if (!this._isStarted) return;

    debug('on running:', commit);

    var m = this._app.models;

    m.ServiceInstance.upsert({
      id: 1,
      executorId: 1,
      serverServiceId: 1,
      groupId: 1,
      currentDeploymentId: commit.hash,
      deploymentStartTime: new Date(),
      // port: XXX(sam) currently unknown to pm or supervisor
      //   pm could use PORT to set it, conceivably, and/or supervisor
      //   can subscribe to 'listen' events and know what port the app
      //   is listening on, and report to pm
      PMPort: this._listenPort,
    }, function(err, obj) {
      debug('upsert ServiceInstance: %j', err || obj);
    });

    m.ServerService.upsert({
      id: 1,
      deploymentInfo: {
        hash: commit.hash,
        dir: commit.dir,
        // Unknown for last-current on pm restart, so don't use:
        // repo: commit.repo,
        // branch: commit.branch,
      },
    }, function(err, obj) {
      debug('upsert ServerService: %j', err || obj);
    });
  });

  // XXX following function has grown too much, and should be refactored
  runner.on('request', function runnerRequest(req, callback) {
    var Process = self._app.models.ServiceProcess;
    var Metric = self._app.models.ServiceMetric;
    // These are all currently notifications, so callback is optional and unused
    // for communicating back to the supervisor. However, the unit tests need to
    // know when models have been updated, so take care to not callback until
    // any actions are complete.
    switch (req.cmd) {
      case 'fork': {
        debug('runner forked: id %d pid %d', req.id, req.pid);
        (new Process({
          pid: req.pid,
          workerId: req.id,
          serviceInstanceId: 1,
          // startTime: new Date
        })).save(function(err, _) {
          debug('upsert Process: %j', err || _);
          assert.ifError(err);
          callback('ok');
        });
        break;
      }
      case 'exit': {
        debug('runner exited: id %d pid %d reason %s suicide? %s',
          req.id, req.pid, req.reason, req.suicide);
        async.waterfall([
          Process.findOne.bind(Process, {
            where: {
              serviceInstanceId: 1,
              workerId: +req.id,
            },
          }),
          function(_, callback) {
            // XXX update exit status
            // _.stopTime = new Date
            // _.stopReason = req.reason
            //   XXX suicide is interesting as well
            _.save(callback);
          },
        ], function(err) {
          assert.ifError(err);
          callback('ok');
        });
        break;
      }
      case 'status': {
        debug('runner status: %j', req);
        // XXX set-size is in status
        break;
      }
      // XXX Note that we don't get the supervisor master as a fork,
      // so lib/runner.js needs to report its start as an event, so we
      // can add a process for it.
      // XXX Note further that if the supervisor master terminates it can fail
      // to report any worker exits... runner needs to emit on exit, and we
      // need to then search for any workers attached to this master, and
      // set them to stopped with some kind of synthetic reason
      // XXX Note even further that it would be worthwhile to add parent proces
      // to the Process model... so that we can retroactively determine which
      // worker process was attached to which supervisor master process...
      case 'metrics': {
        debug('runner metrics: %j', req.metrics);
        async.each(Object.keys(req.metrics.processes), metric, function(err) {
          assert.ifError(err);
          callback('ok');
        });

        function metric(wid, callback) {
          var m = req.metrics.processes[wid];
          var q = {where: {serviceInstanceId: 1, workerId: +wid}};
          Process.findOne(q, function(err, _) {
            assert.ifError(err);
            if (!_) {
              console.error('Ignoring metrics for unknown worker: %d', wid);
              // Metrics can show up after process death, or perhaps even before
              // supervisor knows they have forked. The timing is a bit
              // uncertain, don't rely on it.
              return callback();
            }
            m.processId = _.id;
            m.workerId = wid;
            m.timeStamp = req.metrics.timestamp;
            Metric.upsert(m, callback);
          });
        }
        break;
      }
      default: {
        debug('runner unknown request: %j', req);
        break;
      }
    }
  });
}

util.inherits(Server, EventEmitter);

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
  });

  var self=this;
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

    if (ctl.parent) {
      // Notify parent process when port is listening
      self.once('listening', function(address) {
        ctl.parent.notify({
          cmd: 'pm-port',
          port: address.port,
        });
      });
    }

    self._ipcControl = ctl.local;

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
}

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
      commit.env = self.env(process.env);
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
}

Server.prototype.port = function port() {
  return this._server.address().port;
}

Server.prototype._runCurrent = function _runCurrent(cb) {
    debug('run current deployment');

    // On pm start, bring up the last app to be run as 'current'.
    var currentSymlink = this.git.workdir({id: 'current'});
    var self = this;
    fs.readlink(currentSymlink, function(err, id) {
      if (err) return cb();

      // If we find it, it was already prepared (and run) in the past, so emit
      // it as 'prepared', after figuring out the commit metadata.
      var dir = self.git.workdir({id: id});
      var hash = id.split('.')[0];
      // XXX(sam) repo and branch not known at this point, so config won't be
      // correct!  but config will be gone soon, so we don't care for now.
      var commit = cicadaCommit({hash: hash, id: id, dir: dir});
      commit.config = configForCommit(self._configPath, commit);
      commit.env = self.env(process.env);
      self.emit('prepared', commit);
      process.nextTick(cb);
    });
  }

module.exports = Server;
