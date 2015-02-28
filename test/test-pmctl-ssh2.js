process.env.STRONGLOOP_CLUSTER = 1;

var fmt = require('util').format;
var helper = require('./helper-async');
var tap = require('tap');

tap.test('pmctl over ssh', function(t) {
  helper.pmWithApp([], { STRONGLOOP_PM: 'x' }, function(pm) {
    var sshPath = fmt('http+ssh://127.0.0.1:%d/api', pm.port);
    var pmctl = helper.pmctlWithCtl(sshPath);
    t = helper.queued(t);
    t.waiton(pmctl('status'), /worker count: *1/);
    t.expect(pmctl('log-dump'), /.+ worker:1 pid \d+ listening on \d+/);
    t.expect(pmctl('ls'), /buffertools@/);
    t.shutdown(pm);
  });
});
