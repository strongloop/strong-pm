var helper = require('./helper-pmctl');

helper.test('pmctl', function(t, pm) {
  var pmctl = pm.pmctlFn;

  t.waiton(pmctl('status'), /current:$/m);

  t.test('profiling', function(t) {
    t.expect(pmctl('set-size', '1'));

    t.expect(pmctl('cpu-start', '0'), /Profiler started/);
    t.expect(pmctl('cpu-stop', '0'), /CPU profile written.*node.0.cpuprofile/);

    if (process.platform === 'linux') {
      t.expect(pmctl('cpu-start', '0', '100'), /Profiler started/);
      t.expect(pmctl('cpu-stop', '0'), /CPU profile written.*node.0.cpuprofile/);
    } else {
      t.failon(pmctl('cpu-start', '0', '100'), /Profiler started/);
      t.failon(pmctl('cpu-stop', '0'), /Profiler stopped/);
    }

    if (process.env.STRONGLOOP_LICENSE &&
        process.env.STRONGLOOP_LICENSE.length > 10) {
      t.expect(pmctl('set-size', '1'));
      t.waiton(pmctl('status'), /worker count: *1/);
      t.expect(pmctl('objects-start', '1'));
      t.expect(pmctl('objects-stop', '1'));
    } else {
      t.skip('objects-start/stop, no license');
    }
  });

  t.shutdown(pm);
});
