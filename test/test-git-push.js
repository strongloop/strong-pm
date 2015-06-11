var cp = require('child_process');
var fmt = require('util').format;
var helper = require('./helper-async');
var tap = require('tap');

process.env.STRONGLOOP_CLUSTER = 1;

// XXX(sam) cut-n-paste test code should be refactored into functions
// XXX(sam) each test should be its own file, its to hard to debug like this
tap.test('without auth', function(t) {
  helper.reset(function() {
    helper.pm([], {STRONGLOOP_PM_HTTP_AUTH: ''}, function(pm) {
      var port = pm.port;
      var pmurl = pm.pmurlNoAuth;
      console.log('pmurl: %s', pmurl);

      t.assert(port, 'pm started on port ' + port);
      pm.on('exit', function(code, sig) {
        var SIGTERM = 15;
        t.assert(code === 128 + SIGTERM || sig === 'SIGTERM', 'killed by us');
        t.end();
      });
      cp.exec(fmt('sl-deploy %s master', pmurl), function(er) {
        t.ifError(er, 'deploy succeeds');
        pm.kill('SIGTERM');
      });
    });
  });
});

tap.test('with basic auth and valid credentials', function(t) {
  helper.reset(function() {
    helper.pm([], {STRONGLOOP_PM_HTTP_AUTH: 'basic:user:pass'}, function(pm) {
      var port = pm.port;
      var pmurl = fmt('http://user:pass@127.0.0.1:%d', port);
      console.log('pmurl: %s', pmurl);

      t.assert(port, 'pm started on port ' + port);
      pm.on('exit', function(code, sig) {
        var SIGTERM = 15;
        t.assert(code === 128 + SIGTERM || sig === 'SIGTERM', 'killed by us');
        t.end();
      });
      cp.exec(fmt('sl-deploy %s master', pmurl), function(er) {
        t.ifError(er, 'deploy succeeds');
        pm.kill('SIGTERM');
      });
    });
  });
});

tap.test('with digest auth and valid credentials', function(t) {
  helper.reset(function() {
    helper.pm([], {STRONGLOOP_PM_HTTP_AUTH: 'digest:user:pass'}, function(pm) {
      var port = pm.port;
      var pmurl = fmt('http://user:pass@127.0.0.1:%d', port);
      console.log('pmurl: %s', pmurl);

      t.assert(port, 'pm started on port ' + port);
      pm.on('exit', function(code, sig) {
        var SIGTERM = 15;
        t.assert(code === 128 + SIGTERM || sig === 'SIGTERM', 'killed by us');
        t.end();
      });

      cp.exec(fmt('sl-deploy %s master', pmurl), function(er) {
        t.ifError(er, 'deploy succeeds');
        pm.kill('SIGTERM');
      });
    });
  });
});

tap.test('with auth and invalid credentials', function(t) {
  helper.reset(function() {
    helper.pm([], {STRONGLOOP_PM_HTTP_AUTH: 'basic:user:pass'}, function(pm) {
      var port = pm.port;
      var pmurl = fmt('http://baduser:badpass@127.0.0.1:%d', port);
      console.log('pmurl: %s', pmurl);

      t.assert(port, 'pm started on port ' + port);
      pm.on('exit', function(code, sig) {
        var SIGTERM = 15;
        t.assert(code === 128 + SIGTERM || sig === 'SIGTERM', 'killed by us');
        t.end();
      });
      cp.exec(fmt('sl-deploy %s master', pmurl), function(er) {
        t.assert(er, 'deploy fails');
        pm.kill('SIGTERM');
      });
    });
  });
});
