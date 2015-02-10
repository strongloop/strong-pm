var tap = require('tap');
var helper = require('./helper-async');

module.exports.test = test;

function test(name, callback) {
  var useREST = process.env.STRONGLOOP_PM;
  delete process.env.STRONGLOOP_PM;
  process.env.STRONGLOOP_CLUSTER = 0;

  tap.test(name, { timeout: 120000 }, function(t) {
    helper.pmWithApp([], { STRONGLOOP_PM: useREST }, function(pm) {
      console.log('TEST:', name);
      t = helper.queued(t);
      pm.pmctlFn = helper.pmctlWithCtl(useREST ? pm.pmctlUrl : pm.pmctlPath);
      callback(t, pm);
    });
  });
}
