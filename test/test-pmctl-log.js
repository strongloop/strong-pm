var helper = require('./helper-async');
var tap = require('tap');

tap.test('pmctl log', function(t) {
  process.env.STRONGLOOP_CLUSTER = 1;

  t.test('pmctl log using REST API', function(t) {
    helper.pmWithApp([], function(pm) {
      var pmctl = helper.pmctlWithCtl();
      t = helper.queued(t);
      // worker 1 will show up in the status as something like
      //      1.1.6   6    1     0.0.0.0:3000
      var wid1 = /1\.1\.\d+\s+\d+\s+1\s+ \d+\.\d+\.\d+\.\d+:\d+/g;
      t.waiton(pmctl('status', '1'), wid1);
      t.expect(pmctl('log-dump', '1'), /.+ worker:1 pid \d+ listening on \d+/);
      t.expect(pmctl('log-dump', '1'), /.*/); // repeated calls are successful
      t.shutdown(pm);
    });
  });

  t.end();
});
