var fmt = require('util').format;
var helper = require('./helper-pmctl');
var version = require('../package').version;

helper.test('pmctl', function(t, pm) {
  var pmctl = pm.pmctlFn;

  t.waiton(pmctl('status', '1'), /Processes:$/m);

  t.test('info', function(t) {
    t.expect(pmctl('info'), fmt('Version: *%s', version));
    t.expect(pmctl('info'), fmt('PID: *%d', pm.pid));
    t.expect(pmctl('info'), fmt('Port: *%d', pm.port));
  });

  t.shutdown(pm);
});
