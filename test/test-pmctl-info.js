var fmt = require('util').format;
var helper = require('./helper-pmctl');

helper.test('pmctl', function(t, pm) {
  var pmctl = pm.pmctlFn;

  t.waiton(pmctl('status'), /current:$/m);

  t.test('status has pm pid', function(t) {
    t.expect(pmctl('status'), fmt('pid: *%d', pm.pid));
  });

  t.test('app dependencies', function(t) {
    t.expect(pmctl('ls'), /test-app@/);
    t.expect(pmctl('ls'), /buffertools@/);
  });

  t.shutdown(pm);
});
