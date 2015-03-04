var cicada = require('strong-fork-cicada');
var packReceiver = require('./pack-receiver');
var localDeploy = require('./local-deploy');
var path = require('path');

function setupPushReceiver(server, basePath) {
  var git = cicada(path.resolve(basePath));

  server.git = git;
  server.tar = packReceiver(git);
  server.local = localDeploy(server);
  git.on('commit', server.emit.bind(server, 'commit'));

  function requestDemux(req, res) {
    if (process.env.STRONG_PM_LOCKED) {
      return rejectDeployments(req, res);
    }

    if (req.method === 'PUT') {
      return server.tar.handle(req, res);
    }

    var contentType = req.headers['content-type'];
    if (contentType === 'application/x-pm-deploy') {
      return server.local.handle(req, res);
    }

    return server.git.handle(req, res);
  }

  server._baseApp._deploymentReceiver = requestDemux;
  server._baseApp.use(requestDemux);
}
exports.setupPushReceiver = setupPushReceiver;

function rejectDeployments(req, res) {
  res.status(403)
     .set('Content-Type', 'text/plain')
     .end('Forbidden. Server is not accepting deployments');
}
