var cp = require('child_process');
var tap = require('tap');
var fmt = require('util').format;
var helper = require('./helper-async');

tap.test('without auth', function(t) {
  helper.reset();
  var pm = helper.pm([], { STRONGLOOP_PM_HTTP_AUTH: '' });
  pm.on('listening', function(port) {
    var pmurl = fmt('http://127.0.0.1:%d/default', port);
    console.log('pmurl: %s', pmurl);

    t.assert(port, 'pm started on port ' + port);

    cp.exec(fmt('git push %s master:master', pmurl), function(er) {
      t.ifError(er, 'git push succeeds when auth not required');
      pm.kill('SIGTERM');
    });
  });
  pm.on('exit', function(code, signal) {
    t.equal(signal, 'SIGTERM', 'killed by us');
    t.end();
  });
});

tap.test('with basic auth and valid credentials', function(t) {
  helper.reset();
  var pm = helper.pm([], { STRONGLOOP_PM_HTTP_AUTH: 'basic:user:pass' });
  pm.on('listening', function(port) {
    var pmurl = fmt('http://user:pass@127.0.0.1:%d/default', port);
    console.log('pmurl: %s', pmurl);

    t.assert(port, 'pm started on port ' + port);

    cp.exec(fmt('git push %s master:master', pmurl), function(er) {
      t.ifError(er, 'git push succeeds with basic auth');
      pm.kill('SIGTERM');
    });
  });
  pm.on('exit', function(code, signal) {
    t.equal(signal, 'SIGTERM', 'killed by us');
    t.end();
  });
});

tap.test('with digest auth and valid credentials', function(t) {
  helper.reset();
  var pm = helper.pm([], { STRONGLOOP_PM_HTTP_AUTH: 'digest:user:pass' });
  pm.on('listening', function(port) {
    var pmurl = fmt('http://user:pass@127.0.0.1:%d/default', port);
    console.log('pmurl: %s', pmurl);

    t.assert(port, 'pm started on port ' + port);

    cp.exec(fmt('git push %s master:master', pmurl), function(er) {
      t.ifError(er, 'git push succeeds with digest auth');
      pm.kill('SIGTERM');
    });
  });
  pm.on('exit', function(code, signal) {
    t.equal(signal, 'SIGTERM', 'killed by us');
    t.end();
  });
});


tap.test('with auth and invalid credentials', function(t) {
  helper.reset();
  var pm = helper.pm([], { STRONGLOOP_PM_HTTP_AUTH: 'basic:user:pass' });
  pm.on('listening', function(port) {
    var pmurl = fmt('http://baduser:badpass@127.0.0.1:%d/default', port);
    console.log('pmurl: %s', pmurl);

    t.assert(port, 'pm started on port ' + port);

    cp.exec(fmt('git push %s master:master', pmurl), function(er) {
      t.assert(er, 'git push fails with bad credentials');
      pm.kill('SIGTERM');
    });
  });
  pm.on('exit', function(code, signal) {
    t.equal(signal, 'SIGTERM', 'killed by us');
    t.end();
  });
});
