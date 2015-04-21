var fmt = require('util').format;
var helper = require('./helper-pmctl');

helper.test('pmctl', function(t, pm) {
  var pmctl = pm.pmctlFn;

  t.test('status has pm pid', function(t) {
    //t.expect(pmctl('status'), 'Processes');
    t.failon(pmctl('start', '1'), 'running, so cannot be started');
    t.expect(pmctl('stop', '1'), 'Service.*hard stopped');
    t.waiton(pmctl('status', '1'), 'Not started');
    t.failon(pmctl('stop', '1'), 'Service.*hard stopped');
    // XXX was: 'not running, so cannot be stopped');
    t.expect(pmctl('start', '1'), 'starting');
    t.expect(pmctl('restart', '1'), 'Service.*hard stopped');
    //t.waiton(pmctl('status', '1'), 'Processes');
    t.expect(pmctl('env-get', '1'), 'No matching environment variables defined');
  });

  t.shutdown(pm);
});
