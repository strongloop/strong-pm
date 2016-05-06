// Copyright IBM Corp. 2014,2016. All Rights Reserved.
// Node module: strong-pm
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

var debug = require('debug')('strong-pm:ctl');

module.exports = onCtlRequest;

function onCtlRequest(options, req, callback) {
  debug('request %j', req);

  // Default to service/instance 1 for compatibility with older clients
  var instanceId = req.instanceId || '1';
  var server = options.server;
  var cmd = req.cmd;
  var rsp = {}; // Clear this response if the handler will callback itself.

  switch (cmd) {
    case 'shutdown':
      rsp = shutdown(server, rsp);
      break;

    case 'start':
      rsp = start(server, instanceId, rsp, callback);
      break;

    case 'stop':
      rsp = stop(server, 'hard', instanceId, rsp, callback);
      break;

    case 'soft-stop':
      rsp = stop(server, 'soft', instanceId, rsp, callback);
      break;

    case 'restart':
      rsp = restart(server, 'hard', instanceId, rsp, callback);
      break;

    case 'soft-restart':
      rsp = restart(server, 'soft', instanceId, rsp, callback);
      break;

    case 'env-set':
      rsp = setEnv(server, req.env, instanceId, rsp, callback);
      break;

    case 'env-get':
      // configured only, not actual environment
      // XXX(sam) supervisor now supports getting the actual env
      rsp = getEnv(server, instanceId, rsp, callback);
      break;

    case 'log-dump':
      rsp = logDump(server, instanceId, rsp, callback);
      break;

    case 'current': // Pass-through to current
      rsp = requestOfCurrent(server, instanceId, req, callback);
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

function shutdown(server, rsp) {
  // Allow the response to be sent to client, otherwise a broken ctl connection
  // is the response to a shutdown command.
  setImmediate(function() {
    server.stop(function() {
      // XXX(sam) should not be necessary...
      process.exit(0);
    });
  });
  rsp.message = 'strong-pm is shutting down...';
  return rsp;
}

function start(server, instanceId, rsp, callback) {
  server.startInstance(instanceId, function(err) {
    if (err) {
      rsp.error = err.message;
    } else {
      rsp.message = 'starting...';
    }
    return callback(rsp);
  });
}

function stop(server, style, instanceId, rsp, callback) {
  server.stopInstance(instanceId, style, function(err, status) {
    if (err) {
      rsp.error = err.message;
    } else {
      // If status is null, then it was already stopped, otherwise status is the
      // exit status.
      rsp.status = status;
    }
    return callback(rsp);
  });
}

function restart(server, style, instanceId, rsp, callback) {
  server.restartInstance(instanceId, style, function(err) {
    if (err) {
      rsp.error = err.message;
    } else {
      rsp.message = 're-starting...';
    }
    return callback(rsp);
  });
}

function setEnv(server, env, instanceId, rsp, callback) {
  server.updateInstanceEnv(instanceId, env, function(err) {
    if (err) {
      rsp.error = err.message;
    } else {
      rsp.message = 'ok';
    }
    return callback(rsp);
  });
}

function getEnv(server, instanceId, rsp, callback) {
  server.getInstanceEnv(instanceId, function(err, env) {
    if (err) {
      rsp.error = err.message;
    } else {
      rsp.env = env;
    }
    return callback(rsp);
  });
}

function logDump(server, instanceId, rsp) {
  rsp.log = server.dumpInstanceLog(instanceId);

  if (rsp.log == null) {
    rsp.message = 'No application running, no log to dump';
  }

  return rsp;
}

function requestOfCurrent(server, instanceId, req, callback) {
  req.cmd = req.sub;
  server.requestOfInstance(instanceId, req, callback);
}
