// Copyright IBM Corp. 2015. All Rights Reserved.
// Node module: strong-pm
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

var _ = require('lodash');
var debug = require('debug');
var EventEmitter = require('events').EventEmitter;
var fmt = require('util').format;
var inherits = require('util').inherits;
var isError = require('util').isError;

module.exports = exports = Container;

function Container(image, instance, logger, startOpts) {
  var self = this;
  EventEmitter.call(this);
  this.driver = image.driver;
  this.docker = image.docker;
  this.instance = instance;
  this.instanceId = instance.id;
  this.shouldRestart = true;
  this.image = image;
  this.commit = image.commit;
  this.restartCount = 0;
  this.logger = logger;
  this.startOpts = startOpts;
  this.env = startOpts.env;
  this.onMessage = this._proxyRequest.bind(this);
  this.name = fmt('sl-pm-%s-%s', instance.id, this.commit.hash);
  this.instance.client.on('new-channel', function(channel) {
    // We have a new connection, so the supervisor restarted (or two supervisors
    // are illegally using the same token!).
    if (instance.channel) {
      instance.channel.close();
    }
    self.ctl = instance.channel = channel;
  });
  this.instance.on('request', this.onMessage);
  this.on('created', function() {
    setImmediate(function() {
      self.attachMonitor();
    });
  });
  this.on('exit', function(status) {
    setImmediate(function() {
      self.emit('request', {
        cmd: 'exit',
        pid: 1,
        ppid: 1, // to match the ppid we set on the 'started' message
        wid: 0,
        reason: isError(status) ? 1 : status,
      });
    });
  });
  this._findOrCreate();
  this.debug = debug('strong-pm:docker:container:' + this.instanceId);
}

inherits(Container, EventEmitter);

Container.prototype._dockerCreateOptions = function() {
  var appPort = String(this.env.PORT);
  var exposedPorts = {};
  var portBindings = {};
  exposedPorts[appPort + '/tcp'] = {};
  portBindings[appPort + '/tcp'] = [
    {HostPort: appPort},
  ];
  return {
    name: this.name,
    Image: this.image.name,
    Env: this.dockerEnv(),
    Cmd: this.startArgs(),
    ExposedPorts: exposedPorts,
    PortBindings: portBindings,
  };
};

Container.prototype._findOrCreate = function() {
  var self = this;
  this.docker.getContainer(this.name).inspect(function(err, details) {
    if (err) {
      self._create();
    } else {
      self.c = self.docker.getContainer(details.Id);
      self.cid = details.Id.slice(0, 12);
      self.emit('created');
    }
  });
};

Container.prototype._create = function() {
  var self = this;
  this.docker.createContainer(this._dockerCreateOptions(), function(err, c) {
    self.debug('creatd container:', c);
    if (err) {
      self.emit('error', err);
    } else {
      self.c = c;
      // similar to git, don't need the whole id
      self.cid = c.id.slice(0, 12);
      self.emit('created');
    }
  });
};

Container.prototype.destroy = function(cb) {
  var self = this;
  this.debug('Destroying docker/container instance', this.cid);
  // ensure the master process is properly reported as stopped
  this.emit('exit', 'container destroyed');
  this.instance.removeListener('request', this.onMessage);
  this.c.remove({v: true, force: true}, function(err) {
    if (err) {
      self.log('error removing container:', err);
    } else {
      self.log('removed container: %j', self.cid);
    }
    // lazily cleanup event emitters so that any last words can be heard
    setTimeout(function() {
      self.removeAllListeners();
    }, 5000).unref();
    if (cb) {
      setImmediate(cb);
    }
  });
  this.driver =
    this.docker =
    this.logger =
    this.instance =
    this.c = null;
};

Container.prototype.start = function() {
  this.debug('Docker::Container.start()');
  var self = this;
  this.c.start({}, function(err) {
    if (isError(err)) {
      return self.emit('error', err);
    }
    if (isAlreadyRunning(err)) {
      // fake the 'started' message that would normally be sent on startup
      self._resume();
    }
    self.emit('starting');
  });

  // 304 indicates that the container is already running
  // https://docs.docker.com/reference/api/docker_remote_api_v1.18/
  function isAlreadyRunning(err) {
    return err && err.statusCode === 304;
  }
  function isError(err) {
    return err && err.statusCode !== 304;
  }
};

Container.prototype.startSize = function() {
  if (/cpu/i.test(String(this.startOpts.size))) {
    return this.driver.CPUS;
  } else {
    return this.startOpts.size;
  }
};

Container.prototype.kill = function(cb) {
  this.debug('kill %s', this.cid);
  var self = this;
  this.shouldRestart = false;
  // Docker default is SIGKILL, which is also the only option that results in
  // the docker API call blocking until the container is dead, which is exactly
  // what we want in all cases that this is called!
  this.c.kill(function(err, data) {
    if (err) {
      self.emit('error', err);
    }
    if (cb) {
      cb(err, data);
    }
  });
};

Container.prototype.dockerEnv = function() {
  var env = this.env || {};
  return _(env).pairs().map(function(p) {
    return p.join('=');
  }).value();
};

Container.prototype.startArgs = function() {
  var args = [
    '--cluster=' + this.startOpts.size,
  ];
  if (this.startOpts.trace) {
    args.push('--trace');
  }
  if (!this.startOpts.profile) {
    args.push('--no-profile');
  }
  if (this.startOpts.control) {
    args.push('--control=' + this.startOpts.control);
  }
  return args;
};

Container.prototype.attachMonitor = function() {
  this.debug('Docker::Container.attachMonitor()');
  var attachOpts = {stream: true, stdout: true, stderr: true};
  var self = this;
  if (!this.c) {
    this.debug('attachMonitor after container destroyed');
    return;
  }
  this.c.attach(attachOpts, function(err, stream) {
    if (err) {
      self.debug('error attaching to container %j:', self.cid, err);
      return inspect(err);
    }
    self.docker.modem.demuxStream(stream, self.logger, self.logger);
    stream.on('end', inspect);
    stream.on('close', inspect);
    stream.once('error', inspect);
    self.emit('ready');
  });

  function inspect(err) {
    self.debug('monitor stopped, inspecting %j:', self.cid, err);
    if (!self.c) {
      self.debug('attach/inspect after container destroyed');
      return;
    }
    self.c.inspect(function(err, details) {
      if (err) {
        self.debug('error inspecting monitored container %j:', self.cid, err);
        return self.handleError(err);
      }
      self.debug('inspected container %j:', self.cid);
      if (!details.State.Running) {
        self.emit('exit', details.State.ExitCode);
        if (self.shouldRestart) {
          self.start();
        }
      }
      self.attachMonitor();
    });
  }
};

Container.prototype._resume = function() {
  this.debug('Docker::Container._resume()');
  var self = this;
  this.ctl.request({cmd: 'status'}, function(status) {
    self.debug('supervisor status:', status);
    var started = {
      cmd: 'started',
      wid: 0,
      pid: status.master.pid,
      ppid: status.master.pid, // docker is special, master === init
      pst: status.master.pst,
      appName: status.appName,
      agentVersion: status.agentVersion,
      nodeVersion: status.nodeVersion,
      osVersion: status.osVersion,
      setSize: status.master.setSize,
    };
    self._proxyRequest(started);

    // Since there will only be workers if we are connecting to an existing
    // container, we should fake the fork events for them to resurrect the
    // InstanceProcess's that were marked as dead by the above 'started'
    // notification.
    // Since these processes already exist, they probably already have listening
    // sockets recorded, do we don't need to fake 'listening' events for them,
    // which is good because we can't really fake that without making wild
    // guesses.
    setTimeout(function() {
      status.workers.forEach(function(w) {
        var fork = {
          cmd: 'fork',
          wid: w.id,
          pid: w.pid,
          ppid: status.master.pid,
          pst: w.startTime,
        };
        self._proxyRequest(fork);
      });
      // delayed to ensure it is sent after the 'started' notification
    }, 500);
  });
};

Container.prototype.request = function(req, cb) {
  this.debug('Docker::Container<%s>.request(%j)', this.cid, req);
  this.ctl.request(req, cb);
};

Container.prototype._proxyRequest = function(req, cb) {
  var self = this;
  if (req.cmd === 'started') {
    this.appName = req.appName;
    this.agentVersion = req.agentVersion;
    req.ppid = this.instance.pid;
  }
  setImmediate(function() {
    self.emit('request', req, cb);
  });
};

Container.prototype.handleError = function(err) {
  if (err.statusCode === 404) {
    this.emit('exit', err);
  } else {
    this.emit('error', err);
  }
};

Container.prototype.log = function() {
  var msg = fmt.apply(null, arguments);
  var prefix = fmt('pm:docker i:%s ', this.instanceId);
  if (this.cid) {
    prefix += this.cid + ' ';
  }
  console.log(prefix + msg);
};
