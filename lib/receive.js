'use strict';

var c2s = require('strong-runner').Runnable.toString;
var cicada = require('strong-fork-cicada');
var debug = require('debug')('strong-pm:receive');
var packReceiver = require('./pack-receiver');
var localDeploy = require('./local-deploy');
var path = require('path');

function setupPushReceiver(server, baseApp, basePath) {
  basePath = path.resolve(basePath);
  debug('deploy: git base path %j', basePath);


  function requestDemux(svcId, container, req, res) {
    // XXX(sam) we will need a cicada/basePath per service... the cicada and the
    // container should be bound together into a Driver. decorate the container
    // for now.
    if (!container.git) {
      container.git = cicada(path.resolve(basePath, svcId));
      container.tar = packReceiver(container.git);
      container.local = localDeploy(container);
      container.git.container = container;

      container.git.on('commit', function(commit) {
        commit.container = container;
        debug('receive git commit: %s', c2s(commit));
        server.emit('commit', commit, container); // Just call directly on container/driver?
      });
    }

    var contentType = req.headers['content-type'];

    debug('deploy request: locked? %s method %j content-type %j',
          !!process.env.STRONG_PM_LOCKED, req.method, contentType);

    if (process.env.STRONG_PM_LOCKED) {
      debug('deploy rejected: locked');
      return rejectDeployments(req, res);
    }

    if (req.method === 'PUT') {
      debug('deploy accepted: npm package');
      return container.tar.handle(req, res);
    }

    if (contentType === 'application/x-pm-deploy') {
      debug('deploy accepted: local deploy');
      return container.local.handle(req, res);
    }

    debug('deploy accepted: git deploy');
    return container.git.handle(req, res);
  }

  return requestDemux;
}
exports.setupPushReceiver = setupPushReceiver;

function rejectDeployments(req, res) {
  res.status(403)
     .set('Content-Type', 'text/plain')
     .end('Forbidden. Server is not accepting deployments');
}
