'use strict';
var assert = require('assert');
var passwdUser = require('../lib/passwd-user');

var asyncCalled = false;
process.on('exit', function() {
  assert(asyncCalled);
});

passwdUser('root', function (err, user) {
  assert.ifError(err);
  assert.strictEqual(user.uid, 0);
  if (process.platform === 'linux')
    assert.strictEqual(user.homedir, '/root');
  else if (process.platform === 'darwin')
    assert.strictEqual(user.homedir, '/var/root');
  asyncCalled = true;
});
