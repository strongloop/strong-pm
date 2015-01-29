var assert = require('assert');
var debug = require('debug')('strong-pm:ctl');
var path = require('path');

function onCtlRequest(options, req, callback) {
  debug('request %j', req);

  var app = options.app;
  var runner = options.runner;
  var current = runner.current();
  var cmd = req.cmd;
  var rsp = {}; // Clear this response if the handler will callback itself.

  switch (cmd) {
    case 'status':
      rsp = status(options, callback);
      break;

    case 'pm-stop':
      // Next tick to allow the response to get to pmctl
      process.nextTick(function() {
        app.stop(function() {
          // XXX(sam) should not be necessary...
          process.exit(0);
        });
      });
      rsp.message = 'stopping process manager...';
      break;

    case 'start':
      rsp = start(app, current, rsp, callback);
      break;

    case 'stop':
      rsp = stop(app, 'hard', current, rsp, callback);
      break;

    case 'soft-stop':
      rsp = stop(app, 'soft', current, rsp, callback);
      break;

    case 'restart':
      rsp = restart(app, 'hard', current, rsp, callback);
      break;

    case 'soft-restart':
      rsp = restart(app, 'soft', current, rsp, callback);
      break;

    case 'env-set':
      app.updateEnv(req.env);
      // if the env hasn't actually changed this is a soft reload
      // if the env has changed, it does a hard restart
      rsp.message = 'Updated environment, restarting app';
      break;

    case 'env-get':
      // configured only, not actual environment
      rsp.env = app.env({});
      break;

    case 'log-dump':
      if (current) {
        rsp.log = current.readableLogSnapshot().toString();
        current.flushLogs();
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
  var app = options.app;
  var runner = options.runner;
  var current = runner.current();
  var rsp = {};

  rsp.pid = process.pid;
  rsp.port = app.port();
  rsp.cwd = process.cwd();
  rsp.base = path.resolve(options.base);
  rsp.config = path.resolve(options.config);

  if (!current) {
    return rsp;
  }

  rsp.current = {};
  rsp.current.repo = current.commit.repo;
  rsp.current.branch = current.commit.branch;
  rsp.current.pwd = current.PWD;
  rsp.current.cwd = current.commit.dir;
  rsp.current.config = current.commit.config;

  if (current && current.child) {
    rsp.current.pid = current.child.pid;

    return requestOfCurrent(current, {sub: 'status'}, {}, function(status) {
      rsp.current.workers = status.workers;
      return callback(rsp);
    });
  }

  return rsp;
}

function start(app, current, rsp, callback) {
  if (!current) {
    rsp.error = 'no current application';
    return callback(rsp);
  }

  app.setServiceState(true, function(err) {
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

function stop(app, style, current, rsp, callback) {
  if (!current) {
    rsp.error = 'no current application';
    return callback(rsp);
  }

  var method = {soft: current.softStop, hard: current.stop}[style];
  assert(method, 'stop style invalid');

  app.setServiceState(false, function(err) {
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

function restart(app, style, current, rsp, callback) {
  if (!current) {
    rsp.error = 'no current application';
    return callback(rsp);
  }

  stop(app, style, current, rsp, function(rsp) {
    if (rsp.error) {
      return callback(rsp);
    }

    app.setServiceState(true, function(err) {
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

function requestOfCurrent(current, req, rsp, callback) {
  if (!current || !current.child) {
    rsp.error = 'no current application';
    return rsp;
  }

  req.cmd = req.sub;

  current.request(req, callback);

  return null;
}

exports.onCtlRequest = onCtlRequest;
