var fmt = require('util').format;
var helper = require('./helper-pmctl');

require('tap').test('pmctl info', {skip: 'unimplemented yet'}, function() {
});
return;

helper.test('pmctl', function(t, pm) {
  var pmctl = pm.pmctlFn;

  t.waiton(pmctl('status'), /Processes:$/m);

  /* XXX(sam) pm PID/port is no longer available? */
  t.test('status has pm pid', function(t) {
    t.expect(pmctl('status'), fmt('pid: *%d', pm.pid));
  });

  t.shutdown(pm);
});
