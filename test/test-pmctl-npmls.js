var helper = require('./helper-pmctl');

helper.test('pmctl', function(t, pm) {
  var pmctl = pm.pmctlFn;

  t.waiton(pmctl('status'), /Processes:$/m);

  t.test('app dependencies', function(t) {
    t.expect(pmctl('npmls', '1'), /test-app@/);
  });

  t.shutdown(pm);
});
