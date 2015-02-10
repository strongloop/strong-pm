var fmt = require('util').format;
var helper = require('./helper-pmctl');

helper.test('pmctl', function(t, pm) {
  var pmctl = pm.pmctlFn;

  t.waiton(pmctl('status'), /current:$/m);

  t.test('start/restart/resize', function(t) {
    t.expect(pmctl('set-size', '0'));
    t.waiton(pmctl('status'), /worker count: *0/);

    t.expect(pmctl('status'), fmt('port: *%d', pm.port));
    t.failon(pmctl('start'), 'running, so cannot be started');
    t.expect(pmctl('stop'), 'stopped with status SIGTERM');
    t.waiton(pmctl('status'), /status: *stopped/);
    t.failon(pmctl('stop'), 'not running, so cannot be stopped');
    t.expect(pmctl('start'), 'starting');
    t.waiton(pmctl('status'), /status: *started/);
    t.expect(pmctl('restart'), 'stopped with status SIGTERM, restarting');
    t.waiton(pmctl('status'), /status: *started/);
    t.waiton(pmctl('status'), /worker count: *0/);
    t.expect(pmctl('set-size', '3'));
    t.waiton(pmctl('status'), /worker count: *3/);
    t.expect(pmctl('soft-restart'), 'stopped with status 0, restarting');
    t.waiton(pmctl('status'), /worker count: *0/);

    t.expect(pmctl('set-size', '1'));
    t.waiton(pmctl('status'), /worker count: *1/);

    t.waiton(pmctl('restart'), 'stopped with status SIGTERM, restarting');
    t.waiton(pmctl('status'), /worker count: *0/);
  });

  t.shutdown(pm);
});
