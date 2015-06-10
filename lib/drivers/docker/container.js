'use strict';

var _ = require('lodash');
var debug = require('debug');
var EventEmitter = require('events').EventEmitter;
var fmt = require('util').format;
var inherits = require('util').inherits;
var isError = require('util').isError;
var sCtl = require('strong-control-channel/client');

module.exports = exports = Container;

function Container(image, instance, logger, startOpts) {
  var self = this;
  EventEmitter.call(this);
  this.driver = image.driver;
  this.docker = image.docker;
  this.instance = instance;
  this.instanceId = instance.id;
  this.shouldRestart = true;
  this.connected = false;
  this.image = image;
  this.commit = image.commit;
  this.restartCount = 0;
  this.logger = logger;
  this.startOpts = startOpts;
  this.env = startOpts.env;
  this.onMessage = this._proxyRequest.bind(this);
  this.name = fmt('sl-pm-%s-%s', instance.id, this.commit.hash);
  this.on('created', function() {
    setImmediate(function() {
      self.attachMonitor();
    });
  });
  this.on('starting', function() {
    setImmediate(function() {
      self.updatePortMapping();
    });
  });
  this.on('ports', function() {
    // delay connection to avoid connecting before process is started
    setTimeout(function() {
      self.connectControlChannel();
    }, 500);
  });
  this.on('connected', function() {
    setImmediate(function() {
      self._onConnected();
    });
  });
  this.on('exit', function(status) {
    setImmediate(function() {
      self.emit('request', {
        cmd: 'exit',
        pid: 1,
        id: 0,
        reason: isError(status) ? 1 : status,
      });
    });
  });
  this._connectAttempts = 0;
  this._findOrCreate();
  this.debug = debug('strong-pm:docker:container:' + this.instanceId);
}

inherits(Container, EventEmitter);

Container.prototype._dockerCreateOptions = function() {
  var appPort = String(this.env.PORT);
  var exposedPorts = {
    '8700/tcp': {},
  };
  var portBindings = {
    '8700/tcp': [{HostPort: '0'}],
  };
  exposedPorts[appPort + '/tcp'] = {};
  portBindings[appPort + '/tcp'] = [
    {HostPort: appPort}
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
    if (err && err.reason !== 'container already started') {
      self.emit('error', err);
    } else {
      self.emit('starting');
    }
  });
};

Container.prototype.startSize = function() {
  if (/cpu/i.test(String(this.startOpts.size))) {
    return this.driver.CPUS;
  } else {
    return this.startOpts.size;
  }
};

Container.prototype.connectControlChannel = function() {
  this.debug('Docker::Container.connectControlChannel()');
  var self = this;
  var onMessage = this.onMessage;
  if (this.instance && this.instance.channel) {
    this.ctl = this.instance.channel;
    this.connected = true;
    this.instance.on('request', onMessage);
    return this.emit('connected');
  }
  this.ctl = new sCtl.Client(this.ports.ctl, onMessage, onMessage, onError);
  this._connectAttempts += 1;
  this.ctl._socket.once('connect', function() {
    self.connected = true;
    self.emit('connected');
  });
  this.ctl._socket.once('error', function(err) {
    self.debug('socket error on control channel:', err);
    self.connected = false;
  });

  function onError(err) {
    if (err.code === 'ECONNREFUSED' && self._connectAttempts < 10) {
      self.connected = false;
      setTimeout(self.connectControlChannel.bind(self), 500);
    } else {
      self.debug('onError: ', err, err.stacktrace);
    }
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
  var args = ['--cluster=0'];
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

Container.prototype.updatePortMapping = function() {
  this.debug('Docker::Container.updatePortMapping()');
  var self = this;
  this.c.inspect(function(err, details) {
    if (err) {
      self.debug('error inspecting started %j:', self.cid, err);
      return self.handleError(err);
    }
    self.debug('container details:', details);
    var ports = translatePorts(self.docker, details);
    self.ports = {
      ctl: ports['8700/tcp'],
    };
    self.emit('ports', self.ports);
  });
};

Container.prototype._onConnected = function() {
  this.debug('Docker::Container._onConnected()');
  var self = this;
  // reset so periodic disconnects aren't a timebomb
  this._connectAttempts = 0;
  this.ctl.request({cmd: 'status'}, function(status) {
    self.debug('supervisor status:', status);
    status.master.setSize = self.startSize();
    var started = {
      cmd: 'started',
      wid: 0,
      ppid: status.master.pid,
      pid: status.master.pid,
      pst: status.master.pst || status.master.startTime,
      startTime: status.master.pst || status.master.startTime,
      appName: status.appName,
      agentVersion: status.agentVersion,
      master: status.master,
      setSize: status.master.setSize,
    };
    self.appName = status.appName;
    self.agentVersion = status.agentVersion;
    self.child = status.master;
    // turn status response into a pseudo-notification
    status.cmd = status.cmd || 'status';
    self.emit('request', started);

    // since there will only be workers if we are connecting to an existing
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
          id: w.id,
          pid: w.pid,
          pst: w.startTime || w.pst,
          startTime: w.startTime || w.pst,
        };
        self.emit('request', fork);
      });
      // delayed to ensure it is sent after the 'started' notification
    }, 500);

    // XXX(rmg): using 0 as initial size and then doing an immediate set-size is
    // a hack to reduce the number of notifications we missed out on before we
    // connected.
    // TODO(rmg): replace this hack with support for WS based control channel
    self.debug('sending set-size to supervisor');
    self.ctl.request({cmd: 'set-size', size: started.setSize}, function(rsp) {
      self.debug('set-size sent', rsp);
    });
  });
};

Container.prototype.request = function(req, cb) {
  this.debug('Docker::Container<%s>.request(%j)', this.cid, req);
  if (this.connected) {
    this.debug('request forwarded to supervisor');
    this.ctl.request(req, cb);
  } else {
    this.debug('not connected, request to supervisor deferred');
    this.on('connected', this.request.bind(this, req, cb));
  }
};

Container.prototype._proxyRequest = function(/* req, cb */) {
  var args = ['request'].concat(_.toArray(arguments));
  var self = this;
  setImmediate(function() {
    self.emit.apply(self, args);
  });
};

Container.prototype.handleError = function(err) {
  if (err.statusCode === 404) {
    this.emit('exit', err);
  } else {
    this.emit('error', err);
  }
};

function translatePorts(docker, container) {
  var ports = JSON.parse(JSON.stringify(container.NetworkSettings.Ports));
  var containerIp = '127.0.0.1';

  for (var p in ports) {
    ports[p] = translateMapping(ports[p]);
    ports[p].host = usableIp(docker.modem, containerIp);
  }

  return ports;

  function translateMapping(dockerFormat) {
    if (dockerFormat) {
      return {host: dockerFormat[0].HostIp, port: dockerFormat[0].HostPort};
    } else {
      return {};
    }

  }

  function usableIp(modem, original) {
    return (modem.port && modem.host) || original;
  }
}

Container.prototype.log = function() {
  var msg = fmt.apply(null, arguments);
  var prefix = fmt('pm:docker i:%s ', this.instanceId);
  if (this.cid) {
    prefix += this.cid + ' ';
  }
  console.log(prefix + msg);
};
