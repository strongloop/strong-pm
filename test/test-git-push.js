var cp = require('child_process');
var fmt = require('util').format;
var helper = require('./helper-async');
var tap = require('tap');

process.env.STRONGLOOP_CLUSTER = 1;

tap.test('without auth', function(t) {
  helper.reset(function() {
    helper.pm([], { STRONGLOOP_PM_HTTP_AUTH: '' }, function(pm) {
      var port = pm.port;
      var pmurl = fmt('http://127.0.0.1:%d/default', port);
      console.log('pmurl: %s', pmurl);

      t.assert(port, 'pm started on port ' + port);
      pm.on('exit', function(code, signal) {
        t.equal(signal, 'SIGTERM', 'killed by us');
        t.end();
      });
      cp.exec(fmt('git push %s master:master', pm.pmurlNoAuth), function(er) {
        t.ifError(er, 'git push succeeds when auth not required');
        pm.kill('SIGTERM');
      });
    });
  });
});

tap.test('with basic auth and valid credentials', function(t) {
  helper.reset(function() {
    helper.pm([], { STRONGLOOP_PM_HTTP_AUTH: 'basic:user:pass' }, function(pm) {
      var port = pm.port;
      var pmurl = fmt('http://user:pass@127.0.0.1:%d/default', port);
      console.log('pmurl: %s', pmurl);

      t.assert(port, 'pm started on port ' + port);
      pm.on('exit', function(code, signal) {
        t.equal(signal, 'SIGTERM', 'killed by us');
        t.end();
      });
      cp.exec(fmt('git push %s master:master', pmurl), function(er) {
        t.ifError(er, 'git push succeeds with basic auth');
        pm.kill('SIGTERM');
      });
    });
  });
});

tap.test('with digest auth and valid credentials', function(t) {
  helper.reset(function() {
    helper.pm([], { STRONGLOOP_PM_HTTP_AUTH: 'digest:user:pass' }, function(pm) {
      var port = pm.port;
      var pmurl = fmt('http://user:pass@127.0.0.1:%d/default', port);
      console.log('pmurl: %s', pmurl);

      t.assert(port, 'pm started on port ' + port);
      pm.on('exit', function(code, signal) {
        t.equal(signal, 'SIGTERM', 'killed by us');
        t.end();
      });

      cp.exec(fmt('git push %s master:master', pmurl), function(er) {
        t.ifError(er, 'git push succeeds with digest auth');
        pm.kill('SIGTERM');
      });
    });
  });
});


tap.test('with auth and invalid credentials', function(t) {
  helper.reset(function() {
    helper.pm([], { STRONGLOOP_PM_HTTP_AUTH: 'basic:user:pass' }, function(pm) {
      var port = pm.port;
      var pmurl = fmt('http://baduser:badpass@127.0.0.1:%d/default', port);
      console.log('pmurl: %s', pmurl);

      t.assert(port, 'pm started on port ' + port);
      pm.on('exit', function(code, signal) {
        t.equal(signal, 'SIGTERM', 'killed by us');
        t.end();
      });
      cp.exec(fmt('git push %s master:master', pmurl), function(er) {
        t.assert(er, 'git push fails with bad credentials');
        pm.kill('SIGTERM');
      });
    });
  });
});
