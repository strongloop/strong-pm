var Server = require('../lib/server');
var tap = require('tap');

tap.test('start default', function(t) {
  var s = new Server('pm', '_base', 0, null);
  t.equal(s.getStartCommand(), 'sl-run --cluster=CPU');
  t.end();
});

tap.test('start with env size', function(t) {
  process.env.STRONGLOOP_CLUSTER = 2;

  t.on('end', function() {
    delete process.env.STRONGLOOP_CLUSTER;
  });

  var s = new Server('pm', '_base', 0, null);
  t.equal(s.getStartCommand(), 'sl-run --cluster=2');
  t.end();
});

tap.test('start with option', function(t) {
  var s = new Server('pm', '_base', 0, null);
  t.equal(s.getStartCommand(), 'sl-run --cluster=CPU');
  s.setStartOptions({size: 3});
  t.equal(s.getStartCommand(), 'sl-run --cluster=3');
  s.setStartOptions({size: 7, profile: false});
  t.equal(s.getStartCommand(), 'sl-run --cluster=7 --no-profile');
  s.setStartOptions({size: 1, profile: true});
  t.equal(s.getStartCommand(), 'sl-run --cluster=1');
  t.end();
});
