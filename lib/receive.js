var http = require('http');
var cicada = require('cicada');
var path = require('path');

exports.listen = function listen(port, base) {
  var git = cicada(path.resolve(base));
  var server = http.createServer(git.handle);
  server.listen(port);
  server.git = git;

  git.on('commit', server.emit.bind(server, 'commit'));

  return server;
};
