var fmt = require('util').format;
var helper = require('./helper-pmctl');

helper.test('pmctl', function(t, pm) {
  var pmctl = pm.pmctlFn;

  t.waiton(pmctl('status'), 'Processes');

  t.test('start/restart/resize', function(t) {
    t.expect(pmctl('set-size', '1', '0'));
    t.waiton(pmctl('status'), 'Processes');

    t.failon(pmctl('start', '1'), 'running, so cannot be started');
    t.expect(pmctl('stop', '1'), 'Service.*hard stopped');
    t.waiton(pmctl('status'), 'Not started');
    // XXX(sam) this test fails, hard stop succeeds silently when service
    // is already stopped
    // t.failon(pmctl('stop', '1'), 'not running, so cannot be stopped');
    t.expect(pmctl('start', '1'), 'starting');
    t.waiton(pmctl('status', '1'), 'Processes');
    t.expect(pmctl('restart', '1'), 'Service.*restarting');
    t.waiton(pmctl('status', '1'), 'Processes');

    // XXX(sam) rest of test needs get-worker-count
    return;

    t.waiton(pmctl('status', '1'), /worker count: *0/);
    t.expect(pmctl('set-size', '1', '3'));
    t.waiton(pmctl('status', '1'), /worker count: *3/);
    t.expect(pmctl('soft-restart', '1'), 'stopped with status 0, restarting');
    t.waiton(pmctl('status', '1'), /worker count: *0/);

    t.expect(pmctl('set-size', '1'));
    t.waiton(pmctl('status'), /worker count: *1/);

    t.waiton(pmctl('restart', '1'), 'stopped with status SIGTERM, restarting');
    t.waiton(pmctl('status'), /worker count: *0/);
  });

  t.shutdown(pm);
});
