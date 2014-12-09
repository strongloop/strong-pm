process.env.STRONG_PM_LOCKED = 1;
var app = require('./helper');
var assert = require('assert');

var server = app.listen();

server.on('listening', function() {
  app.push('some-repo-name', function(code, output) {
    assert(code != 0, 'app push should fail');
    assert(/403/.test(output), 'error message should mention 403 code');
    server.stop();
    app.ok = true;
  });
});

server.on('commit', function(commit) {
  assert.fail('locked strong-pm should never emit a commit');
});
