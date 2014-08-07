var cicada = require('cicada');
var packReceiver = require('./pack-receiver');
var http = require('http');
var path = require('path');

var server;
function requestDemux(req, res) {
  if (req.method === 'PUT') {
    return server.tar.handle(req, res);
  }
  return server.git.handle(req, res);
}

exports.listen = function listen(port, base) {
  server = http.createServer(requestDemux);
  server.listen(port);

  var git = cicada(path.resolve(base));

  server.git = git;
  server.tar = packReceiver(git);
  git.on('commit', server.emit.bind(server, 'commit'));

  return server;
};
