process.env.STRONGLOOP_CLUSTER = 1;

var fmt = require('util').format;
var helper = require('./helper-async');
var tap = require('tap');

tap.test('pmctl over ssh', function(t) {
  helper.pmWithApp([], function(pm) {
    var sshPath = fmt('http+ssh://127.0.0.1:%d', pm.port);
    var pmctl = helper.pmctlWithCtl(sshPath);
    t = helper.queued(t);
    // worker 1 will show up in the status as something like
    //      1.1.6   6    1     0.0.0.0:3000
    var wid1 = /1\.1\.\d+\s+\d+\s+1\s+ \d+\.\d+\.\d+\.\d+:\d+/g;
    t.waiton(pmctl('status', '1'), wid1);
    t.shutdown(pm);
  });
});
