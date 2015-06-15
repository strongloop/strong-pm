var helper = require('./helper-pmctl');

helper.test('pmctl', function(t, pm) {
  var pmctl = pm.pmctlFn;

  // Note in below that cluster size is set to 0, so that a running app will
  // have a single process, wid 0, the supervisor.
  t.test('status has pm pid', function(t) {
    t.waiton(pmctl('status', '1'), 'Processes');
    t.expect(pmctl('get-process-count', '1'), 'processes: 1');

    t.failon(pmctl('start', '1'), 'running, so cannot be started');

    t.expect(pmctl('stop', '1'), 'Service.*hard stopped');
    t.waiton(pmctl('status', '1'), 'Not started');
    t.expect(pmctl('get-process-count', '1'), 'processes: 0');

    // XXX(sam) this test fails, hard stop succeeds silently when service
    // is already stopped
    // t.failon(pmctl('stop', '1'), 'not running, so cannot be stopped');

    t.expect(pmctl('start', '1'), 'starting');
    t.waiton(pmctl('get-process-count', '1'), 'processes: 1');
    t.expect(pmctl('status', '1'), 'Processes');

    t.expect(pmctl('restart', '1'), 'Service.*restarting');
    t.waiton(pmctl('get-process-count', '1'), 'processes: 1');
    t.expect(pmctl('status', '1'), 'Processes');

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
