var fs = require('fs');
var helper = require('./helper-pmctl');

helper.test('pmctl', function(t, pm) {
  var pmctl = pm.pmctlFn;

  t.waiton(pmctl('status'), /current:$/m);

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
