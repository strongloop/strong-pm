require('node-syslog');

var server = require('http').createServer().listen(process.env.PORT || 0, function() {
  console.log('pid %d listening on %s', process.pid, this.address().port);
});

function handler(signame) {
  var signo = process.binding('constants')[signame];
  console.log('die on %s (%s)', signame, signo);
  process.exit(signo);
}

function exitOn(signame) {
  process.once(signame, handler.bind(null, signame));
}

exitOn('SIGTERM');
exitOn('SIGINT');
exitOn('SIGHUP');
