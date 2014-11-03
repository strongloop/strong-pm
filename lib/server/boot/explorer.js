var explorer = require('loopback-explorer');

module.exports = function(server){
  var restApiRoot = server.get('restApiRoot');
  server.use('/explorer', explorer(server, {basePath: restApiRoot}));
}
