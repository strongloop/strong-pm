var assert = require('assert');
var debug = require('debug')('strong-pm:ctl');
var path = require('path');

module.exports = onCtlRequest;

// FIXME service, instance (or just their ID) should come in here
function onCtlRequest(options, req, callback) {
  debug('request %j', req);

  var server = options.server;
  // FIXME all calls on container and current should be changed to
  // options.server.doXXX(...)
  var container = options.server._driver._containers[1]; // !!!
  var current = container.current; // !!!
  var models = options.models;
  var cmd = req.cmd;
  var rsp = {}; // Clear this response if the handler will callback itself.

  switch (cmd) {
    case 'status':
      rsp = status(options, callback);
      break;

    case 'pm-stop':
      // setImmediate to allow the response to get to pmctl
      setImmediate(function() {
        server.stop(function() {
          // XXX(sam) should not be necessary...
          process.exit(0);
        });
      });
      rsp.message = 'stopping process manager...';
      break;

    case 'start':
      rsp = start(server, current, rsp, callback);
      break;

    case 'stop':
      rsp = stop(server, 'hard', current, rsp, callback);
      break;

    case 'soft-stop':
      rsp = stop(server, 'soft', current, rsp, callback);
      break;

    case 'restart':
      rsp = restart(server, 'hard', current, rsp, callback);
      break;

    case 'soft-restart':
      rsp = restart(server, 'soft', current, rsp, callback);
      break;

    case 'env-set':
      rsp = setEnv(server, models, req.env, callback);
      break;

    case 'env-get':
      // configured only, not actual environment
      // XXX(sam) supervisor now supports getting the actual env
      rsp.env = server.env({});
      break;

    case 'log-dump':
      if (current) {
        rsp.log = container.readableLogSnapshot().toString();
        container.flushLogs();
      } else {
        rsp.message = 'No application running, no log to dump';
      }
      break;

    case 'current': // Pass-through to current
      rsp = requestOfCurrent(current, req, rsp, callback);
      break;

    default:
      rsp.error = 'unsupported';
      break;
  }

  if (rsp) {
    debug('response:', rsp);

    process.nextTick(callback.bind(null, rsp));
  }
}

function status(options, callback) {
  var server = options.server;
  var container = options.container;
  var current = container.current;
  var rsp = {};

  rsp.pid = process.pid;
  rsp.port = server.port();
  rsp.cwd = process.cwd();
  rsp.base = path.resolve(options.base);
  rsp.version = {
    'strong-pm': require('../package.json').version,
    api: require('strong-mesh-models/package.json').version,
  };

  if (!current) {
    return rsp;
  }

  rsp.current = {};
  rsp.current.repo = current.commit.repo;
  rsp.current.branch = current.commit.branch;
  rsp.current.pwd = current.PWD;
  rsp.current.cwd = current.commit.dir;

  if (current && current.child) {
    rsp.current.pid = current.child.pid;

    return requestOfCurrent(current, {sub: 'status'}, {}, function(status) {
      rsp.current.workers = status.workers;
      return callback(rsp);
    });
  }

  return rsp;
}

function start(server, current, rsp, callback) {
  if (!current) {
    rsp.error = 'no current application';
    return callback(rsp);
  }

  var svcId = 1; // XXX(sam) should be the service that is being started

  server.setServiceState(svcId, true, function(err) {
    if (err) {
      rsp.error = err.message;
      return callback(rsp);
    }

    if (current.start()) {
      rsp.message = 'starting...';
    } else {
      rsp.error = 'application running, so cannot be started';
    }
    callback(rsp);
  });
}

function stop(server, style, current, rsp, callback) {
  if (!current) {
    rsp.error = 'no current application';
    return callback(rsp);
  }

  var method = {soft: current.softStop, hard: current.stop}[style];
  assert(method, 'stop style invalid');

  server.setServiceState(false, function(err) {
    if (err) {
      rsp.error = err.message;
      return callback(rsp);
    }

    method.call(current, function(status) {
      if (status != null) {
        callback({message: style + ' stopped with status ' + status});
      } else {
        callback({error: 'application not running, so cannot be stopped'});
      }
    });
  });
}

function restart(server, style, current, rsp, callback) {
  if (!current) {
    rsp.error = 'no current application';
    return callback(rsp);
  }

  stop(server, style, current, rsp, function(rsp) {
    if (rsp.error) {
      return callback(rsp);
    }

    server.setServiceState(true, function(err) {
      if (err) {
        rsp.error = err.message;
        return callback(rsp);
      }

      current.start();
      rsp.message += ', restarting...';
      return callback(rsp);
    });
  });
}

function setEnv(server, models, env, callback) {
  // FIXME should be
  // options.server.setEnv(svcId, env, callback);

  // if the env hasn't actually changed this is a soft reload
  // if the env has changed, it does a hard restart
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
    });
  });
}

function requestOfCurrent(current, req, rsp, callback) {
  if (!current || !current.child) {
    rsp.error = 'no current application';
    return rsp;
  }

  req.cmd = req.sub;

  current.request(req, callback);

  return null;
}
