var assert = require('assert');
var channel = require('strong-control-channel/server');
var debug = require('debug')('strong-pm:ipcctl');
var fs = require('fs');
var path = require('path');
var util = require('util');

exports.start = start;
exports.onRequest = onRequest; // For testing

function start(options) {
  // XXX(sam) I don't like this 'last one wins' approach, but its impossible to
  // prevent the channel outliving the server under all conditions, this is the
  // only robust way I've found.
  try {
    fs.unlinkSync(options.control);
  } catch(er) {
    // Didn't exist
  }

  var server = channel.create(onRequest.bind(null, options))
    .listen(options.control);

  server.unref();

  server.on('error', function(er) {
    console.error('Control channel failed to listen on `%s`: %s',
      options.control, er);
    throw er;
  });

  return server;
}

function onRequest(options, req, callback) {
  debug('request %j', req);

  var http = options.http;
  var runner = options.runner;
  var current = runner.current();
  var cmd = req.cmd;
  var rsp = {};
  // FIXME repo appears to be undefined when current is restarted, so I don't
  // think it will pick up the configuration

  switch (cmd) {
    case 'status':
      rsp = status(options, callback);
      break;

    case 'pm-stop':
      // Next tick to allow the response to get to pmctl
      process.nextTick(function() {
        http.close();
        runner.stop(function() {
          // XXX(sam) should not be necessary...
          process.exit(0);
        });
      });
      rsp.message = 'stopping process manager...';
      break;

    case 'start':
      if (current) {
        if (current.start()) {
          rsp.message = 'starting...';
        } else {
          rsp.error = 'application running, so cannot be started';
        }
      } else {
        rsp.error = 'no current application';
      }
      break;

    case 'stop':
      rsp = stop('hard', current, rsp, callback);
      break;

    case 'soft-stop':
      rsp = stop('soft', current, rsp, callback);
      break;

    case 'restart':
      rsp = restart('hard', current, rsp, callback);
      break;

    case 'soft-restart':
      rsp = restart('soft', current, rsp, callback);
      break;

    case 'current': // Pass-through to current
      rsp = requestOfCurrent(current, req, rsp, callback);
      break;

    default:
      rsp.error = 'unsupported';
      break;
  }

  if(callback && rsp) {
    debug('response:', rsp);

    process.nextTick(callback.bind(null, rsp));
  }
}

function status(options, callback) {
  var http = options.http;
  var runner = options.runner;
  var current = runner.current();
  var rsp = {};

  rsp.pid = process.pid;
  rsp.port = http.address().port;
  rsp.cwd = process.cwd();
  rsp.base = path.resolve(options.base);
  rsp.config = path.resolve(options.config);

  if (!current)
    return rsp;

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

function stop(style, current, rsp, callback) {
  if (current) {
    var method = {soft: current.softStop, hard: current.stop}[style];
    assert(method, 'stop style invalid');

    method.call(current, function(status) {
      if (status != null) {
        callback({message: style + ' stopped with status ' + status});
      } else {
        callback({error: 'application not running, so cannot be stopped'});
      }
    });
    rsp = null;
  } else {
    rsp.error = 'no current application';
  }
  return rsp;
}

function restart(style, current, rsp, callback) {
  if (!current) {
    rsp.error = 'no current application';
  } else {
    rsp = stop(style, current, rsp, function(rsp) {
      if (rsp.error)
        return callback(rsp);

      current.start();

      rsp.message += ', restarting...';
      return callback(rsp);
    });
  }
  return rsp;
}

function requestOfCurrent(current, req, rsp, callback) {
  if (!current || !current.child) {
    rsp.error = 'no current application';
    return  rsp;
  }

  req.cmd = req.sub;

  current.request(req, callback);

  return null;
}
