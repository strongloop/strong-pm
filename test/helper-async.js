var assert = require('assert');
var path = require('path');
var cp = require('child_process');
var childctl = require('strong-control-channel/process');
var defaults = require('lodash').defaults;

require('shelljs/global');

exports.reset = reset;
exports.pm = pm;

function reset(callback) {
  console.log('working dir for %s is %s', process.argv[1], process.cwd());

  // Enter test sandbox app
  cd(path.resolve(__dirname, 'app'));

  // Make sure we're working in our sandbox
  assert.equal(package().name, 'test-app', 'cwd is test-app');

  rm('-rf', '../receive-base');
  rm('-rf', '.git', '.strong-pm');
  ex('git clean -f -d -x .');
  assert(!test('-e', 'node_modules'));
  ex('git init');
  ex('git add .');
  ex('git commit --author="sl-pm-test <nobody@strongloop.com>" -m initial');
  ex('sl-build --install --commit');

  assert(!test('-e', 'node_modules/debug'), 'dev dep not installed');
  assert(test('-e', 'node_modules/buffertools'), 'prod dep installed');
  assert(!test('-e', 'node_modules/buffertools/build'), 'addons not built');
  assert(which('sl-build'), 'sl-build not in path');

  console.log('test/app built succesfully');

  if (callback) {
    setImmediate(callback);
  }

  function ex(cmd, async) {
    console.log('exec `%s`', cmd);
    return exec(cmd, async);
  }

  function package() {
    return require(path.resolve(pwd(),'package.json'));
  }
}

var pmcli = require.resolve('../bin/sl-pm.js');

function pm(args, env, callback) {
  args = args || [];
  env = env || {};

  if (typeof env === 'function' && !callback) {
    callback = env;
    env = {};
  }

  // Listened on zero to avoid port conflicts, search for actual port.
  args.push('--listen=0');

  console.log('pmcli:', pmcli, args);

  var pm = cp.spawn(pmcli, args, {
    stdio: ['ignore', process.stdout, process.stderr, 'ipc'],
    env: defaults(env, process.env),
  });

  pm.on('error', function(er) {
    assert.ifError(er);
  });

  if (callback) {
    pm.on('listening', callback);
  }

  // Used by PM to signal its controller that it is listening
  pm.ctl = childctl.attach(onReceive, pm);

  return pm;

  function onReceive(req, cb) {
    if (req.cmd && req.cmd === 'listening') {
      console.log('Listening port: %s', req.port);
      pm.emit('listening', req.port);
    }
    return cb();
  }
}
