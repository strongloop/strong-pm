var fs = require('fs');
var helper = require('./helper-pmctl');

helper.test('pmctl', function(t, pm) {
  var pmctl = pm.pmctlFn;

  t.waiton(pmctl('status'), /Processes:$/m);

  t.test('heap snapshot', function(t) {
    // XXX(sam) we could resize and snapshot worker 0, but I don't think it
    // makes a difference in this test.
    //   t.expect(pmctl('set-size', '1', '1'));

    // Match:
    //      ID      PID   WID  Tracking objects?  CPU profiling?
    //      ..
    //  1.1.30561  30561   0
    t.waiton(pmctl('status'), / 1\.1\..* 0/);
    t.expect(pmctl('heap-snapshot', '1.1.0', '_heap'));
    t.test('heapsnapshot file', function(t) {
      t.doesNotThrow(
        function() {
          fs.statSync('_heap.heapsnapshot');
        },
        '_heap.heapsnapshot should exist'
      );
    });
  });

  t.shutdown(pm);
});
