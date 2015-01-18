var tap = require('tap');

var auth = require('../lib/auth');

tap.test('auth parsing', function(t) {
  var io = {
    'basic:user:pass': 'basic:user:pass',
    'digest:user:pass': 'digest:user:pass',
    'user:pass': 'basic:user:pass',
  };
  for (var input in io) {
    t.equal(auth.parse(input).normalized, io[input], 'normalizes ' + io);
  }
  t.end();
});
