var cicada = require('cicada');
var packReceiver = require('./pack-receiver');
var path = require('path');

function setupPushReceiver(server, basePath) {
  var git = cicada(path.resolve(basePath));

  server.git = git;
  server.tar = packReceiver(git);
  git.on('commit', server.emit.bind(server, 'commit'));

  function requestDemux(req, res) {
    if (req.method === 'PUT') {
      return server.tar.handle(req, res);
    }
    return server.git.handle(req, res);
  }

  server._app._deploymentReceiver = requestDemux;
  server.use(requestDemux);
};
exports.setupPushReceiver = setupPushReceiver;
