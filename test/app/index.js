require('node-syslog');

var server = require('http').createServer().listen(process.env.PORT || 0, function() {
  console.log('pid %d listening on %s', process.pid, this.address().port);
});

function handler(signame) {
  console.log('die on %s', signame);
  process.kill(process.pid, signame);
}

function exitOn(signame) {
  process.once(signame, handler.bind(null, signame));
}

exitOn('SIGTERM');
exitOn('SIGINT');
exitOn('SIGHUP');
