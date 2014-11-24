module.exports = function(server) {
  // Install a `/` route that returns server status
  server.get('/', server.loopback.status());
};

