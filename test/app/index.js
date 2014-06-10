require('node-syslog');

require('http').createServer().listen(process.env.PORT || 0, function() {
  console.log('listening on %s', this.address().port);
});
