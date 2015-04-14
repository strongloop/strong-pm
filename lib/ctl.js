'use strict';

var debug = require('debug')('strong-pm:ctl');

module.exports = onCtlRequest;

function onCtlRequest(options, req, callback) {
  debug('request %j', req);

  var svcId = req.serviceId;
  var server = options.server;
  var cmd = req.cmd;
  var rsp = {}; // Clear this response if the handler will callback itself.

  switch (cmd) {
    case 'shutdown':
      rsp = shutdown(server);
      break;

    case 'start':
      rsp = start(server, svcId, rsp, callback);
      break;

    case 'stop':
      rsp = stop(server, 'hard', svcId, rsp, callback);
      break;

    case 'soft-stop':
      rsp = stop(server, 'soft', svcId, rsp, callback);
      break;

    case 'restart':
      rsp = restart(server, 'hard', svcId, rsp, callback);
      break;

    case 'soft-restart':
      rsp = restart(server, 'soft', svcId, rsp, callback);
      break;

    case 'env-set':
      rsp = setEnv(server, req.env, svcId, rsp, callback);
      break;

    case 'env-get':
      // configured only, not actual environment
      // XXX(sam) supervisor now supports getting the actual env
      rsp.env = server.env(svcId);
      break;

    case 'log-dump':
      rsp = logDump(server, svcId, rsp, callback);
      break;

    case 'current': // Pass-through to current
      rsp = requestOfCurrent(server, svcId, req, callback);
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

function start(server, svcId, rsp, callback) {
  server.startService(svcId, function(err) {
    if (err) {
      rsp.error = err.message;
    } else {
      rsp.message = 'starting...';
    }
    return callback(rsp);
  });
}

function stop(server, style, svcId, rsp, callback) {
  server.stopService(svcId, style, function(err, status) {
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

function restart(server, style, svcId, rsp, callback) {
  server.restartService(svcId, style, function(err) {
    if (err) {
      rsp.error = err.message;
    } else {
      rsp.message = 're-starting...';
    }
    return callback(rsp);
  });
}

function setEnv(server, env, svcId, rsp, callback) {
  server.setServiceEnv(svcId, env, function(err) {
    if (err) {
      rsp.error = err.message;
    }
    return callback(rsp);
  });
}

function logDump(server, svcId, rsp) {
  rsp.log = server.dumpServiceLog(svcId);

  if (rsp.log == null) {
    rsp.message = 'No application running, no log to dump';
  }

  return rsp;
}

function requestOfCurrent(server, svcId, req, callback) {
  req.cmd = req.sub;
  server.requestOfService(svcId, req, callback);
}
