var fmt = require('util').format;
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

    // XXX(sam, rmg) status should be zero, but message should be like:
    //   not running, so cannot be stopped
    t.expect(pmctl('stop', '1'), 'Service.*hard stopped');
    t.expect(pmctl('status', '1'), 'Not started');
    t.expect(pmctl('get-process-count', '1'), 'processes: 0');

    t.expect(pmctl('start', '1'), 'starting');
    t.waiton(pmctl('status', '1'), 'Processes');
    t.expect(pmctl('get-process-count', '1'), 'processes: 1');

    t.expect(pmctl('restart', '1'), 'Service.*restarting');
    t.waiton(pmctl('status', '1'), 'Processes');
    t.expect(pmctl('get-process-count', '1'), 'processes: 1');

    t.expect(pmctl('env-get', '1', '0'), 'No matching environment variables defined');
  });

  t.shutdown(pm);
});
