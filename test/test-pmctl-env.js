var helper = require('./helper-pmctl');

helper.test('pmctl', function(t, pm) {
  var pmctl = pm.pmctlFn;

  t.waiton(pmctl('status'), /current:$/m);

  t.test('env get/set/unset', function testEnv(t) {
    t.expect(pmctl('set-size', '1'));
    t.waiton(pmctl('status'), /worker count: *1/);

    t.expect(pmctl('env-get'), 'No matching environment variables defined');
    t.expect(pmctl('env-get', 'NOTSET'), 'No matching environment variables defined');

    t.expect(pmctl('env-set', 'FOO=bar', 'BAR=foo'), 'Environment updated');
    t.expect(pmctl('env-get'), /FOO=bar/);
    t.expect(pmctl('env-get'), /BAR=foo/);
    t.expect(pmctl('env-get', 'FOO'), /FOO=bar/);
    t.expect(pmctl('env-get', 'NOTSET'), 'No matching environment variables defined');

    t.expect(pmctl('env-unset', 'FOO'), 'Environment updated');
    t.expect(pmctl('env-get'), /BAR=foo/);
    t.expect(pmctl('env-get', 'FOO'), 'No matching environment variables defined');
  });

  t.shutdown(pm);
});
