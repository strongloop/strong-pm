var helper = require('./helper-pmctl');

helper.test('pmctl', function(t, pm) {
  var pmctl = pm.pmctlFn;

  t.waiton(pmctl('status'), /Processes:$/m);

  t.test('env get/set/unset', function testEnv(t) {
    t.expect(pmctl('env-get', '1'),
             'No matching environment variables defined');

    t.expect(pmctl('env-get', '1', 'NOTSET'),
             'No matching environment variables defined');

    t.expect(pmctl('env-set', '1', 'FOO=bar', 'BAR=foo'),
             'environment updated');

    t.expect(pmctl('env-get', '1'),
             /FOO *bar/);

    t.expect(pmctl('env-get', '1'),
             /BAR *foo/);

    t.expect(pmctl('env-get', '1', 'FOO'),
             /FOO *bar/);

    t.expect(pmctl('env-get', '1', 'NOTSET'),
             'No matching environment variables defined');

    t.expect(pmctl('env-unset', '1', 'FOO'),
             'environment updated');

    t.expect(pmctl('env-get', '1'),
             /BAR *foo/);

    t.expect(pmctl('env-get', '1', 'FOO'),
             'No matching environment variables defined');
  });

  t.shutdown(pm);
});
