// Copyright IBM Corp. 2015. All Rights Reserved.
// Node module: strong-pm
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

var Driver = require('./null-driver');
var driverHelpers = require('./driver-helpers');
var tap = require('tap');

tap.test('DirectDriver constructor API', function(t) {
  driverHelpers.testConstructor(t, Driver);
  t.end();
});

tap.test('DirectDriver instance API', function(t) {
  var driver = new Driver({baseDir: 'BASE', console: {}, server: {}});
  driverHelpers.testInstance(t, driver);
  t.end();
});
