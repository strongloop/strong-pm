var tap = require('tap');
var mandatory = require('../lib/util').mandatory;

tap.test('mandatory', function(t) {
  t.throws(function() {
    mandatory(null);
  });
  t.throws(function() {
    mandatory(undefined);
  });
  t.equal(mandatory(0), 0);
  t.equal(mandatory(''), '');
  t.end();
});
