// Copyright IBM Corp. 2015. All Rights Reserved.
// Node module: strong-pm
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

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
