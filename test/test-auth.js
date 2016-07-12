// Copyright IBM Corp. 2015. All Rights Reserved.
// Node module: strong-pm
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

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
