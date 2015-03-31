'use strict';

var c2s = require('strong-runner').Runnable.toString;
var cicada = require('strong-fork-cicada');
var debug = require('debug')('strong-pm:receive');
var packReceiver = require('./pack-receiver');
var localDeploy = require('./local-deploy');
var path = require('path');

function setupPushReceiver(server, basePath) {
  basePath = path.resolve(basePath);
  debug('deploy: git base path %j', basePath);

  server.git = cicada(path.resolve(basePath));
  server.tar = packReceiver(server.git);
  server.local = localDeploy(server);

  server.git.on('commit', function(commit) {
    debug('receive git commit: %s', c2s(commit));
    server.emit('commit', commit);
  });

  function requestDemux(req, res) {
    var contentType = req.headers['content-type'];

    debug('deploy request: locked? %s method %j content-type %j',
          !!process.env.STRONG_PM_LOCKED, req.method, contentType);

    if (process.env.STRONG_PM_LOCKED) {
      debug('deploy rejected: locked');
      return rejectDeployments(req, res);
    }

    if (req.method === 'PUT') {
      debug('deploy accepted: npm package');
      return server.tar.handle(req, res);
    }

    if (contentType === 'application/x-pm-deploy') {
      debug('deploy accepted: local deploy');
      return server.local.handle(req, res);
    }

    debug('deploy accepted: git deploy');
    return server.git.handle(req, res);
  }

  server._baseApp.use(requestDemux);
}
exports.setupPushReceiver = setupPushReceiver;

function rejectDeployments(req, res) {
  res.status(403)
     .set('Content-Type', 'text/plain')
     .end('Forbidden. Server is not accepting deployments');
}
