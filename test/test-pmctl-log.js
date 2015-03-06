var helper = require('./helper-async');
var tap = require('tap');

tap.test('pmctl log', function(t) {
  process.env.STRONGLOOP_CLUSTER = 1;

  t.test('pmctl log using local socket', function(t) {
    helper.pmWithApp([], {STRONGLOOP_PM: ''}, function(pm) {
      var pmctl = helper.pmctlWithCtl(pm.pmctlPath);
      t = helper.queued(t);
      t.waiton(pmctl('status'), /worker count: *1/);
      t.expect(pmctl('log-dump'), /.+ worker:1 pid \d+ listening on \d+/);
      t.expect(pmctl('log-dump'), /.*/); // repeated calls are successful
      t.shutdown(pm);
    });
  });

  t.test('pmctl log using REST API', function(t) {
    helper.pmWithApp([], {STRONGLOOP_PM: 'x'}, function(pm) {
      var pmctl = helper.pmctlWithCtl(pm.pmctlUrl);
      t = helper.queued(t);
      t.waiton(pmctl('status'), /worker count: *1/);
      t.expect(pmctl('log-dump'), /.+ worker:1 pid \d+ listening on \d+/);
      t.expect(pmctl('log-dump'), /.*/); // repeated calls are successful
      t.shutdown(pm);
    });
  });
});
