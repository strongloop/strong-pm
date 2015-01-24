var fs = require('fs');
var tap = require('tap');
var fmt = require('util').format;
var helper = require('./helper-async');

var useREST = process.env.STRONGLOOP_PM;
delete process.env.STRONGLOOP_PM;

process.env.STRONGLOOP_CLUSTER = 0;

function test(name, callback) {
  tap.test(name, { timeout: 120000 }, function(t) {
    helper.pmWithApp([], { STRONGLOOP_PM: useREST }, function(pm) {
      console.log('TEST:', name);
      t = helper.queued(t);
      callback(t, pm);
    });
  });
}

test('pmctl', function(t, pm) {
  var pmctl = helper.pmctlWithCtl(useREST ? pm.pmctlUrl : pm.pmctlPath);

  t.waiton(pmctl('status'), /current:$/m);

  t.test('status has pm pid', function(t) {
    t.expect(pmctl('status'), fmt('pid: *%d', pm.pid));
  });

  t.test('app dependencies', function(t) {
    t.expect(pmctl('ls'), /test-app@/);
    t.expect(pmctl('ls'), /buffertools@/);
  });

  t.test('start/restart/resize', function(t) {
    t.expect(pmctl('set-size', '0'));
    t.waiton(pmctl('status'), /worker count: *0/);

    t.expect(pmctl('status'), fmt('port: *%d', pm.port));
    t.failon(pmctl('start'), 'running, so cannot be started');
    t.expect(pmctl('stop'), 'stopped with status SIGTERM');
    t.waiton(pmctl('status'), /status: *stopped/);
    t.failon(pmctl('stop'), 'not running, so cannot be stopped');
    t.expect(pmctl('start'), 'starting');
    t.waiton(pmctl('status'), /status: *started/);
    t.expect(pmctl('restart'), 'stopped with status SIGTERM, restarting');
    t.waiton(pmctl('status'), /status: *started/);
    t.waiton(pmctl('status'), /worker count: *0/);
    t.expect(pmctl('set-size', '3'));
    t.waiton(pmctl('status'), /worker count: *3/);
    t.expect(pmctl('soft-restart'), 'stopped with status 0, restarting');
    t.waiton(pmctl('status'), /worker count: *0/);

    t.expect(pmctl('set-size', '1'));
    t.waiton(pmctl('status'), /worker count: *1/);

    t.waiton(pmctl('restart'), 'stopped with status SIGTERM, restarting');
    t.waiton(pmctl('status'), /worker count: *0/);
  });

  t.test('env get/set/unset', function(t) {
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

  t.test('heap snapshot', function(t) {
    t.waiton(pmctl('status'), /current:$/m);
    t.expect(pmctl('set-size', '1'));
    t.waiton(pmctl('status'), /worker count: *1/);
    t.expect(pmctl('heap-snapshot', '1', '_heap'));
    t.waiton(pmctl('status'), /worker count: *1/);
    t.test('heapsnapshot file', function(t) {
      t.doesNotThrow(
        function() {
          fs.statSync('_heap.heapsnapshot')
        },
        '_heap.heapsnapshot should exist'
      );
    });
  });

  t.shutdown(pm);
});
