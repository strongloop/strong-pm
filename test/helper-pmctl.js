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
