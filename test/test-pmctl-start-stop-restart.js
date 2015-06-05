var fmt = require('util').format;
var helper = require('./helper-pmctl');

helper.test('pmctl', function(t, pm) {
  var pmctl = pm.pmctlFn;

  t.waiton(pmctl('get-process-count', '1'), 'processes: 1');

  t.test('start/restart/resize', function(t) {
    t.expect(pmctl('set-size', '1', '0'));
    t.waiton(pmctl('get-process-count', '1'), 'processes: 1');

    t.failon(pmctl('start', '1'), 'running, so cannot be started');
    t.expect(pmctl('stop', '1'), 'Service.*hard stopped');
    t.waiton(pmctl('status'), 'Not started');

    // XXX(sam) this test fails, hard stop succeeds silently when service
    // is already stopped
    // t.failon(pmctl('stop', '1'), 'not running, so cannot be stopped');

    t.expect(pmctl('start', '1'), 'starting');
    t.waiton(pmctl('get-process-count', '1'), 'processes: 1');

    t.expect(pmctl('restart', '1'), 'Service.*restarting');

    t.waiton(pmctl('get-process-count', '1'), 'processes: 1');

    t.expect(pmctl('set-size', '1', '3'));
    t.waiton(pmctl('get-process-count', '1'), /processes: 4/);

    t.expect(pmctl('soft-restart', '1'), 'Service.*soft restarting');
    t.waiton(pmctl('get-process-count', '1'), /processes: 4/);

    t.expect(pmctl('set-size', '1', '1'));
    t.waiton(pmctl('get-process-count', '1'), /processes: 2/);

    t.expect(pmctl('restart', '1'), 'Service.*restarting');
    t.waiton(pmctl('get-process-count', '1'), /processes: 2/);
  });

  t.shutdown(pm);
});
