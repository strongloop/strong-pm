var fmt = require('util').format;
var helper = require('./helper-pmctl');

helper.test('pmctl', function(t, pm) {
  var pmctl = pm.pmctlFn;

  t.waiton(pmctl('status'), /current:$/m);

  t.test('status has pm pid', function(t) {
    t.expect(pmctl('status'), fmt('pid: *%d', pm.pid));
    t.expect(pmctl('ls'), /test-app@/);
    t.failon(pmctl('start'), 'running, so cannot be started');
    t.expect(pmctl('stop'), 'stopped with status SIGTERM');
    t.waiton(pmctl('status'), /status: *stopped/);
    t.failon(pmctl('stop'), 'not running, so cannot be stopped');
    t.expect(pmctl('start'), 'starting');
    t.expect(pmctl('restart'), 'stopped with status SIGTERM, restarting');
    t.waiton(pmctl('status'), /status: *started/);
    t.expect(pmctl('env-get'), 'No matching environment variables defined');
  });

  t.shutdown(pm);
});
