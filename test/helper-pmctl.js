// Copyright IBM Corp. 2015. All Rights Reserved.
// Node module: strong-pm
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

var debug = require('debug')('strong-pm:test:helper-pmctl');
var tap = require('tap');
var helper = require('./helper-async');

module.exports.test = test;

function test(name, callback) {
  process.env.STRONGLOOP_CLUSTER = 0;

  tap.test(name, {timeout: 120000}, function(t) {
    debug('start test %s', name);
    helper.pmWithApp([], {}, function(pm) {
      debug('start test %s - has app', name);
      t = helper.queued(t);
      pm.pmctlFn = helper.pmctlWithCtl(pm.pmctlUrl);
      callback(t, pm);
    });
  });
}
