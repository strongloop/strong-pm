// Copyright IBM Corp. 2015,2016. All Rights Reserved.
// Node module: strong-pm
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

var MeshServiceManager = require('strong-mesh-models').ServiceManager;
var assert = require('assert');
var async = require('async');
var debug = require('debug')('strong-pm:service-manager');
var fmt = require('util').format;
var util = require('util');
var pmVersion = require('../package.json').version;
var versionApi = require('strong-mesh-models/package.json').apiVersion;
var _ = require('lodash');

module.exports = ServiceManager;

function ServiceManager(server, options) {
  this._server = server;
  this._meshApp = null;
  this._basePort = (options && Number(options.basePort)) || 3000;

  debug('options: %j', options);

  // Bind handle to this for use as middleware.
  this.handle = this.handle.bind(this);
}

util.inherits(ServiceManager, MeshServiceManager);

var prototype = ServiceManager.prototype;

// Support pm v3.x/mesh v5.x deployments, by directing all these requests to
// service 'default' as deploy requests. Default will be created if it doen't
// exist.
prototype.handle = function(req, res, next) {
  var url = req.url;

  if (!/\/default$/.test(url) && !/\/default\/.*/.test(url))
    return next();

  debug('handle old-style deploy to: %s', req.url);

  var Service = this._meshApp.models.ServerService;
  var name = 'default';
  var filter = {
    order: ['id ASC'],
    where: {
      or: [
        {name: name},
        {id: 1},
      ],
    },
  };
  var service = {name: name, _groups: [{id: 1, name: 'default', scale: 1}]};

  Service.findOrCreate(filter, service, function(err, service) {
    if (err) {
      console.error('service-manager: handle.findOrCreate: %s', err);
      return next(err);
    }
    debug('old-style deploy to svc %j name %j', service.id, service.name);

    service.deploy(req, res, next);
  });
};

// On first run of pm, the default models will be created in the DB (a single
// executor, etc.). On next run, any existing processes will be marked as
// stopped (since on startup PM has no children).
// XXX(sam) Its not true that there are no children in the Docker case... the
// docker driver will have to report status on any live children it finds,
// and the processes will become alive again.
prototype.initOrUpdateDb = function(meshApp, callback) {
  this._meshApp = meshApp;
  var models = meshApp.models;
  var Executor = models.Executor;
  var Process = models.ServiceProcess;
  var Service = models.ServerService;

  var self = this;
  // Set the default environment for any new services that are created
  Service.definition.properties.env.default = function() {
    var env = self._server.getDefaultEnv();
    debug('get default env: %j', env);
    return env;
  };

  this._meshApp.dataSources.db.autoupdate(function(err) {
    if (err) return callback(err);

    Executor.findById('1', function(err, executor) {
      if (err) return callback(err);
      if (!executor) {
        return self._initDb(stopStaleProcesses);
      }

      executor.APIPort = self._listenPort;
      executor.save(stopStaleProcesses);
    });
  });

  function stopStaleProcesses(err) {
    if (err) return callback(err);
    Process.find(function(err, procs) {
      if (err) return callback(err);
      async.each(procs, stopProcess, callback);
    });
  }

  function stopProcess(proc, callback) {
    // Anything other than null, undefined, or '' is a reason.
    if (proc.stopReason != null && proc.stopReason !== '') {
      return callback();
    }
    debug('mark stopped: pid %j wid %j', proc.pid, proc.workerId);
    proc.stopReason = 'StrongLoop Process Manager was stopped';
    proc.stopTime = new Date();
    proc.save(callback);
  }
};

prototype._initDb = function _initDb(callback) {
  debug('initialize DB: create executor');
  var models = this._meshApp.models;
  var Executor = models.Executor;

  var executor = new Executor({
    id: 1,
    address: 'localhost',
    APIPort: this._listenPort,
  });

  executor.save(callback);
};

prototype.instanceStarted = function(instanceId, started, callback) {
  var self = this;
  var commit = started.containerVersionInfo.commit;
  var meshApp = self._meshApp;

  var ServiceInstance = this._meshApp.models.ServiceInstance;
  ServiceInstance.findById(instanceId, function(err, instance) {
    if (err) return callback(err);

    var serviceId = instance.serverServiceId;

    var meta = util._extend({}, started);
    var containerVersionInfo = util._extend({}, started.containerVersionInfo);

    delete meta.containerVersionInfo;
    delete containerVersionInfo.commit;

    debug('%s: started:', iid(serviceId, instanceId));
    debug('set Service.deploymentInfo: %j', commit);
    debug('set ServiceInstance: %j', meta);
    debug('set ServiceInstance.containerVersionInfo: %j', containerVersionInfo);

    // Remove direct access to commit!

    async.series([
      // commit goes into Service.deploymentInfo
      meshApp.setServiceCommit.bind(meshApp, serviceId, commit),
      // true goes into ServiceInstance.started
      self.setServiceState.bind(self, serviceId, true),
      // most simple properties of started go into Instance directly:
      // - applicationName PMPort setSize agentVersion restartCount
      // - startTime set to new Date()
      // - started set to true
      //   XXX(sam) so why did we just call setServiceCommit()?
      // - currentDeploymentId is commitHash
      // - containerVersionInfo is containerVersionInfo
      meshApp.handleModelUpdate.bind(meshApp, instanceId, started),
    ], callback);
  });
};

// Set ServiceInstance.started to started
// XXX(sam) This is derived data... it is "started" if there is a supervisor,
// wid 0, so why are we tracking it seperately? Is started set *before* the
// supervisor reports the first status?
// XXX(sam) rename to setServiceStarted()
prototype.setServiceState = function(svcId, started, callback) {
  var ServiceInstance = this._meshApp.models.ServiceInstance;
  var where = {where: {serverServiceId: svcId}};
  ServiceInstance.findOne(where, function(err, instance) {
    debug('setServiceState: svc %j to %j', svcId, started);

    assert.ifError(err);
    assert(instance, fmt('svcId %j', svcId));

    instance.started = started;
    instance.save(function(err) {
      assert.ifError(err);
      callback();
    });
  });
};

prototype.onCtlRequest = function(service, instance, req, callback) {
  req.serviceId = service.id;
  req.instanceId = instance.id;
  this.onApiRequest(req, callback);
};

prototype.onApiRequest = function(req, callback) {
  debug('onCtlRequest: %j', req);

  this._server.onCtlRequest(req, function(res) {
    if (res.error) return callback(Error(res.error));
    callback(null, res);
  });
};

// Called 'after save' of ServiceInstance.
prototype.onInstanceUpdate = function(instance, callback) {
  debug('onInstanceUpdate: iid %j cpus %j', instance.id, instance.cpus);

  if (instance.cpus != null)
    this._server.setStartOptions(instance.id, {size: instance.cpus});
  this._server.setStartOptions(instance.id, {trace: instance.tracingEnabled});

  // XXX(rmg) there's a buggy ordering dependency somewhere.. using setImmediate
  // instead of nextTick causes test-server.js to fail
  process.nextTick(callback);
};

prototype.onServiceUpdate = function(service, callback) {
  var self = this;

  debug('onServiceUpdate: svc %j env: %j', service.id, service.env);

  async.series([findOrCreateInstance, updateEnvironment], callback);

  // XXX(sam) I don't understand why we create an instance if one doesn't exist
  // yet. We don't appear to need it, why not let it come into existence on
  // deploy or start?
  function findOrCreateInstance(callback) {
    var models = self._meshApp.models;
    var Instance = models.ServiceInstance;

    service.instances(function(err, instances) {
      if (err) return callback(err);
      if (instances.length > 0) return callback();

      debug('onServiceUpdate: create first instance');

      var instance = new Instance({
        executorId: 1,
        serverServiceId: service.id,
        groupId: 1,
        cpus: 'STRONGLOOP_CLUSTER' in process.env ?
          process.env.STRONGLOOP_CLUSTER : 'CPU',

        // allow starting tracing on all instances via env for testing purposes
        tracingEnabled: !!process.env.STRONGLOOP_TRACING || false,
      });
      instance.save(callback);
    });
  }

  function updateEnvironment(callback) {
    var env = getServiceEnv(service, self._basePort);

    service.instances(true, function(err, instances) {
      if (err) return callback(err);

      debug('updateInstanceEnv: svc %j instances: %s',
            service.id, instances.map(function(i) {
              return i.id;
            }).join(', '));

      async.each(instances, updateInstanceEnv, callback);

      function updateInstanceEnv(instance, callback) {
        // Override env so strong-trace returns the instanceId as the hostname
        env.STRONGLOOP_TRACES_ID = String(instance.id);
        self._server.updateInstanceEnv(instance.id, env, callback);
      }
    });
  }
};

prototype.onServiceDestroy = function(service, callback) {
  debug('onServiceDestroy: svc %j', service.id);

  var self = this;
  service.instances(function(err, instances) {
    if (err) return callback(err);

    async.each(instances, destroyInstance, callback);
    function destroyInstance(instance, callback) {
      self._server.destroyInstance(instance.id, callback);
    }
  });
};

prototype.onDeployment = function(service, req, res) {
  debug('onDeployment: svc %j', service.id);

  var self = this;
  service.instances(function(err, instances) {
    if (err) {
      debug(err);
      res.status(500).set({});
      res.end('Error while deploying: ' + err.message);
      return;
    }
    if (instances.length <= 0) {
      debug(err);
      res.status(500).set({});
      res.end('Error while deploying: no instance found');
      return;
    }
    var instance = instances[0];
    self._server.deployInstance(instance.id, req, res);
  });
};

prototype.getInstanceEnv = function(instanceId, callback) {
  var self = this;
  var models = this._meshApp.models;
  var Instance = models.ServiceInstance;

  Instance.findById(instanceId, function(err, instance) {
    if (err) return callback(err);
    if (!instance)
      return callback(Error('Unable to find instance with id ' + instanceId));

    instance.serverService(function(err, service) {
      if (err) return callback(err);
      if (!service)
        return callback(
          Error('Unable to find service for instance with id ' + instanceId)
        );

      var env = getServiceEnv(service, self._basePort);

      // Override env so strong-trace returns the instanceId as the hostname
      env.STRONGLOOP_TRACES_ID = String(instanceId);

      debug('getInstanceEnv(%s) -> %j', instanceId, env);
      callback(null, env);
    });
  });
};

prototype.getInstanceMetas = function(callback) {
  var models = this._meshApp.models;
  var Instance = models.ServiceInstance;

  debug('getInstanceMetas to restart:');

  Instance.find(function(err, instances) {
    if (err) return callback(err);

    var metas = {};
    for (var i in instances) {
      if (!instances.hasOwnProperty(i)) continue;
      var instance = instances[i];
      var meta = instance.containerVersionInfo;
      debug('restart %s: %j', iid(instance), instance);

      if (meta) {
        metas[instance.id] = meta;

        debug('%s: size %j', iid(instance), instance.cpus);
        debug('%s: trace %j', iid(instance), instance.tracingEnabled);
        metas[instance.id].size = instance.cpus;
        metas[instance.id].trace = instance.tracingEnabled;
      }
    }
    callback(null, metas);
  });
};

ServiceManager.prototype.getApiVersionInfo = function(callback) {
  var models = this._meshApp.models;
  var driverInfo = this._server.getDriverInfo();
  callback(null, new models.Api({
    version: pmVersion,
    serverPid: process.pid,
    apiVersion: versionApi,
    apiPort: this._server.port(),
    driverType: driverInfo.type,
    driverStatus: driverInfo.status,
  }));
};

function getServiceEnv(service, basePort) {
  var hostEnv = _.pick(process.env, 'STRONGLOOP_LICENSE');
  var servicePortEnv = {PORT: String(basePort + service.id)};
  return _.merge(hostEnv, servicePortEnv, service.env);
}

// Accepts either:
// - serviceId, instanceId
// - instance
function iid(instance, id) {
  if (id)
    return fmt('svc %d.%d', instance, id);
  return fmt('svc %d.%d', instance.serverServiceId, instance.id);
}
