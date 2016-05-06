// Copyright IBM Corp. 2015,2016. All Rights Reserved.
// Node module: strong-pm
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

var _ = require('lodash');
var async = require('async');
var control = require('../common/control');
var debug = require('debug')('strong-pm:docker:driver');
var Docker = require('dockerode');
var EventEmitter = require('events').EventEmitter;
var fmt = require('util').format;
var Image = require('./image');
var inherits = require('util').inherits;
var isError = require('util').isError;
var logBuffer = require('../common/log-buffer');
var mandatory = require('./../../util').mandatory;
var path = require('path');

module.exports = exports = DockerDriver;

function DockerDriver(opts) {
  if (!(this instanceof DockerDriver)) {
    return new DockerDriver(opts);
  }
  EventEmitter.call(this);
  this.docker = opts.docker || new Docker();
  this.Image = opts.Image || Image;

  this.baseDir = mandatory(opts.baseDir);
  this.console = mandatory(opts.console);
  this.server = mandatory(opts.server);
  this._wsRouter = opts.wsRouter;

  this._instances = {};

  this.defaultStartOptions = {
    profile: true,
    trace: false,
    size: 'STRONGLOOP_CLUSTER' in process.env ?
      process.env.STRONGLOOP_CLUSTER : 'CPU',
  };

  this.on('request', this._onRequest.bind(this));

  this.log = logTo(this.console.log);
  this.error = logTo(this.console.error);

  function logTo(logFn) {
    return log;

    function log() {
      var msg = fmt.apply(null, arguments);
      logFn('pm:docker: ' + msg);
    }
  }
}

inherits(DockerDriver, EventEmitter);

DockerDriver.prototype.setStartOptions = function(id, opts) {
  debug('setStartOptions(%j, %j)', id, opts);
  var instance = this._instance(id);
  var original = _.clone(instance.startOpts);

  instance.startOpts = _.merge(instance.startOpts, opts);

  if (opts.size != null && opts.size !== original.size) {
    debug('cluster size changed, sending set-size: %j => %j', id, opts);
    this.requestOfInstance(id, {cmd: 'set-size', size: opts.size},
                           function(rsp) {
                             debug('set-size %j: resp %j', opts.size, rsp);
                           });
  }

  if (opts.trace != null && opts.trace !== original.trace) {
    debug('set tracing: %j', opts.trace);
    this.requestOfInstance(id,
      {cmd: 'tracing', enabled: opts.trace},
      function(rsp) {
        debug('tracing %j: rsp %j', opts.trace, rsp);
      }
    );
  }
};

DockerDriver.prototype.removeInstance = function(id, cb) {
  debug('removeInstance(%j)', id);
  var instance = this._instance(id);
  if (instance.current) {
    instance.current.kill(function(err) {
      instance.current.destroy();
      delete instance.current;
      delete this._instances[id];
      if (instance.client) {
        instance.client.close();
      }
      cb(err);
    });
  } else {
    setImmediate(cb);
  }
};

DockerDriver.prototype.deployInstance = function(id, req, res) {
  debug('deployInstance(%j)', id);
  var self = this;
  var instance = this._instance(id);
  var image = this.Image.from(this, instance.svcDir, req, res);
  instance.nextImage = image;
  image.on('error', function(err) {
    self.error('error deploying: %s, %j', err, err);
    throw err;
  });
  image.on('image', function() {
    debug('Deployment image:', image.name);
    if (instance.current) {
      instance.current.destroy(start);
    } else {
      start();
    }
  });

  function start() {
    self.startInstance(id, function(err) {
      if (err) {
        self.error('Error deploying instance %j:', id, err);
      } else {
        self.log('Instance %j deployed', id);
      }
    });
  }
};

DockerDriver.prototype.startInstance = function(id, cb) {
  debug('startInstance(%j, %j)', id, cb.name);
  var self = this;
  var instance = this._instance(id);
  var imgToLaunch = instance.nextImage ||
                    instance.currentImage ||
                    instance.previousImage;
  this.server.getInstanceEnv(id, function(err, env) {
    if (err) return cb(err);
    var opts = _.merge(instance.startOpts, {env: env});
    instance.log.enableGC();
    instance.ports = [];
    instance.previousImage = instance.currentImage;
    instance.currentImage = imgToLaunch;
    delete instance.nextImage;
    instance.current = imgToLaunch.start(instance, instance.log, opts);
    instance.current.on('created', function() {
      instance.driverMeta.user = {
        container: instance.current.cid,
      };
    });
    instance.commit = imgToLaunch.commit;
    instance.current.on('request', function(req) {
      debug('bubbling up request from instance %j:', id,
            _.pick(req, ['pid', 'wid', 'pst', 'cmd']));
      self.emit('request', id, req);
    });
    instance.current.on('error', function(err) {
      self.error('error from docker child %j:', id, err);
    });
    instance.current.on('exit', function(err) {
      if (isError(err) && err.statusCode === 404 && this === instance.current) {
        self.startInstance(id, function() {
          self.log('restarted instance after container disappeared (exit)');
        });
      }
    });
    if (cb) {
      instance.current.once('starting', cb);
    }
  });
};

// TODO: extract and move to drivers/common
DockerDriver.prototype._onRequest = function(instanceId, req) {
  var instance = this._instance(instanceId);
  switch (req.cmd) {
    case 'listening':
      // emit a listening event each time a _new_ port is listened on
      var addrKey = addr2str(req.address);
      if (instance.ports.indexOf(addrKey) < 0) {
        instance.ports.push(addrKey);
        this.emit('listening', instanceId, req.address);
      }
  }
};

function addr2str(address) {
  var str;
  if ('address' in address) {
    str = fmt('%s:%d', address.address || '0.0.0.0', address.port);
  } else {
    str = fmt('unix:%s', address);
  }
  return str;
}

DockerDriver.prototype.stopInstance = function(id, style, cb) {
  debug('stopInstance(%j, %j, %s)', id, style, cb.name);
  var instance = this._instance(id);
  instance.shouldRestart = false;
  switch (style) {
    case 'soft':
      return this.requestOfInstance(id, {cmd: 'stop'}, reportExit);
    case 'hard':
    default:
      if (instance.current) {
        return instance.current.kill(reportExit);
      } else {
        return setImmediate(cb);
      }
  }
  function reportExit(err, res) {
    debug('stopped container for instance %j:', id, err, res);
    cb(err, res);
  }
};

DockerDriver.prototype.dumpInstanceLog = function(id) {
  debug('DockerDriver.dumpInstanceLog(%j)', id);
  var instance = this._instance(id);
  if (instance.current) {
    return instance.log.dump();
  } else {
    debug('no instance to dump logs for: %j', id);
    return null;
  }
};

DockerDriver.prototype.updateInstanceEnv = function(id, env, cb) {
  debug('DockerDriver.updateInstanceEnv(%j)', id);
  var current = this._instance(id).current;
  if (!current) {
    debug('no instance to update env of: %j', id);
    return setImmediate(cb);
  }
  debug('updating instance %j env: %j', id, env);
  if (_.isEqual(current.env, env)) {
    debug('env unchanged, skipping restart: %j', id);
    return cb && setImmediate(cb);
  } else {
    debug('env changed, restarting %j: %j => %j', id, current.env, env);
    var unset = _.difference(_.keys(current.env), _.keys(env));
    // env is already a copy
    current.env = env;
    async.series([
      this._ctlCmd(id, {cmd: 'env-unset', env: unset}),
      this._ctlCmd(id, {cmd: 'env-set', env: env}),
      this._ctlCmd(id, {cmd: 'restart'}),
    ], cb);
  }
};

DockerDriver.prototype._ctlCmd = function(id, cmd) {
  var self = this;

  return wrappedCtl;

  function wrappedCtl(next) {
    self.requestOfInstance(id, cmd, function(rsp) {
      next(rsp && rsp.error, rsp);
    });
  }
};

DockerDriver.prototype.requestOfInstance = function(id, req, cb) {
  debug('DockerDriver.requestOfInstance(%j)', id);
  var instance = this._instance(id);
  if (instance.current) {
    debug('requesting of %j: %j', id, req);
    return instance.current.request(req, cb);
  } else if (cb) {
    setImmediate(cb({error: 'Cannot send request to instance'}));
  }
};

DockerDriver.prototype.start = function(instanceMetas, cb) {
  debug('start', instanceMetas);
  var self = this;
  async.series([
    getInfo,
    pullNode,
    pullDebian,
  ], function(err) {
    if (err) {
      self.error('Error in Docker Driver startup:', err.message);
      self.error('Please make sure that strong-pm has read/write access to ' +
                 '/var/run/docker.sock or that the DOCKER_HOST and other ' +
                 'environment variables are configured for remote access.');
      return cb(err);
    }
    self.log('driver started, restarting/reconnecting existing apps if any');
    for (var id in instanceMetas) {
      self._resume(id, instanceMetas[id]);
    }
    return cb();
  });

  function getInfo(next) {
    self.docker.info(function(err, info) {
      if (err) {
        return next(err);
      }
      self.dockerInfo = info;
      self.CPUS = info.NCPU;
      debug('Connected to docker:', err, info);
      next(err);
    });
  }

  function pullNode(next) {
    self.log('Prefetching base docker image: node:0.10');
    self.docker.pull('node:0.10', {repo: 'node'}, function(err, stream) {
      if (err) {
        next(err);
      } else {
        self.docker.modem.followProgress(stream, next);
      }
    });
  }

  function pullDebian(next) {
    self.log('Prefetching base docker image: debian:jessie');
    self.docker.pull('debian:jessie', {repo: 'debian'}, function(err, stream) {
      if (err) {
        next(err);
      } else {
        self.docker.modem.followProgress(stream, next);
      }
    });
  }
};

// meta object example:
// {
//   "os": {"platform":"darwin","arch":"x64","release":"14.3.0"},
//   "node":"v0.10.38",
//   "container":{"type":"strong-pm","version":"4.1.1"},
//   "commit":{
//     "hash":"69a0c1043e4882d48f",
//     "dir":"/path/.strong-pm/svc/1/work/69a0c1043e4882d48f.1431733664453"},
//   "size":"CPU"
// }
DockerDriver.prototype._resume = function(id, meta) {
  var self = this;
  var instance = this._instance(id);
  var Image = this.Image;
  var image = instance.nextImage = new Image(this, instance.svcDir);
  instance.commit = meta.commit;
  image.commit = meta.commit;
  image.emit('commit', meta.commit);
  image.on('error', function(err) {
    self.error('error deploying %j:', id, err);
    throw err;
  });
  image.on('image', function() {
    debug('Deployment image for %j:', id, image.name);
    self.startInstance(id, function(err) {
      if (err) {
        self.error('error resuming %j', id, err);
      } else {
        self.log('resumed instance %j', id);
      }
    });
  });
};

DockerDriver.prototype.stop = function(cb) {
  var self = this;
  this.log('shutting down driver');
  async.each(Object.keys(this._instances), stopInstanceById, cb);

  function stopInstanceById(id, next) {
    self.stopInstance(id, 'hard', next);
  }
};

DockerDriver.prototype.instanceById =
DockerDriver.prototype._instance = function(id) {
  var instance = this._instances[id];
  if (!instance) {
    instance = new EventEmitter;
    _.assign(instance, {
      id: id,
      startOpts: _.clone(this.defaultStartOptions),
      log: logBuffer(),
      pid: 1,
      commit: {hash: null, dir: null},
      restartCount: 0,
      driverMeta: {},
      svcDir: path.resolve(this.baseDir, 'svc', String(id)),
    });
    var client = control.accept(this.server, this._wsRouter, onRequest);
    instance.client = client;
    instance.startOpts.control = client.url;
    this._instances[id] = instance;
  }
  return this._instances[id];

  function onRequest(req) {
    debug('Request via ws(%s):', id, req);
    instance.emit('request', req);
  }
};

DockerDriver.prototype.getName = function() {
  return 'Docker';
};

DockerDriver.prototype.getStatus = function() {
  return 'running';
};
