var assert = require('assert');
var env = process.env;
var fs = require('fs');

console.log('PID %d', process.pid);
console.log('CWD %s', process.cwd());
console.log('ENV.supervisor_profile:', env.supervisor_profile);
console.log('ENV.PATH:', env.PATH);
console.log('ENV.PWD:', env.PWD);

// Check PWD is a symlink to our current working directory.
assert(env.PWD !== process.cwd());
assert.equal(fs.realpathSync(env.PWD), process.cwd());

// Check binary dependencies were compiled
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
