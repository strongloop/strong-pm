var helper = require('./helper-pmctl');

helper.test('pmctl profiling', function(t, pm) {
  var pmctl = pm.pmctlFn;

  t.test('profiling', function(t) {
    t.waiton(pmctl('status', '1'), 'Processes');

    t.expect(pmctl('set-size', '1', '1'));

    t.expect(pmctl('cpu-start', '1.1.0'), /Profiler started/);
    t.expect(pmctl('cpu-stop', '1.1.0'), /CPU profile written.*0.cpuprofile/);

    if (process.env.STRONGLOOP_LICENSE &&
        process.env.STRONGLOOP_LICENSE.length > 10) {
      if (process.platform === 'linux') {
        t.expect(pmctl('cpu-start', '1.1.0', '100'), /Profiler started/);
        t.expect(pmctl('cpu-stop', '1.1.0'), /CPU profile .*0.cpuprofile/);
      } else {
        t.failon(pmctl('cpu-start', '1.1.0', '100'), /profiling not supported/);
        t.failon(pmctl('cpu-stop', '1.1.0'), /profiler not started/);
      }
    } else {
      t.failon(pmctl('cpu-start', '1.1.0', '100'), /requires license/);
      t.failon(pmctl('cpu-stop', '1.1.0'), /profiler not started/);
    }

    if (process.env.STRONGLOOP_LICENSE &&
        process.env.STRONGLOOP_LICENSE.length > 10) {
      t.expect(pmctl('objects-start', '1.1.1'));
      t.expect(pmctl('objects-stop', '1.1.1'));
    } else {
      t.test('objects-start/stop', {skip: 'no license'}, function() {
      });
    }
    return;
  });

  t.shutdown(pm);
});
