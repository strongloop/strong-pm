var assert = require('assert');
var async = require('async');
var debug = require('debug')('strong-pm:test');
var path = require('path');
var util = require('util');

require('shelljs/global');

exports.configForCommit = require('../lib/config').configForCommit;
exports.main = require('../').main;
exports.prepare = require('../lib/prepare').prepare;
exports.run = require('../lib/run').run;
exports.stop = require('../lib/run').stop;

function ex(cmd, async) {
  console.log('exec `%s`', cmd);
  return exec(cmd, async);
}

exports.ex = ex;

console.log('working dir for %s is %s', process.argv[1], process.cwd());

var Server = require('../lib/server');

// Check for node silently exiting with code 0 when tests have not passed.
exports.ok = false;

process.on('exit', function(code) {
  if (exports.ok === undefined)
    return; // Test isn't using the OK check
  if (code === 0) {
    assert(exports.ok, 'test did not set OK before exit');
    console.log('PASS');
  }
});

function package() {
  return require(path.resolve(pwd(),'package.json'));
}

exports.package = package;

cd(path.resolve(__dirname, 'app'));

var APPNAME = 'test-app';
exports.APPNAME = APPNAME;

assert.equal(package().name, APPNAME, 'cwd is ' + APPNAME);

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

var server;
var port;

exports.listen = function() {
  var base = '../receive-base';
  mkdir('-p', base);
  var app = new Server('test', path.resolve(base, 'config'), base, 0, 'pmctl');
  app.on('listening', function(listenAddr){
    port = listenAddr.port;
    console.log('git receive listening on  %d', port);
  });

  app.start();
  return app;
};

// Pushes don't work if we have already pushed... so force a new repo name for
// each push.
var REPO = 'repo';
var version = 0;

function repoN() {
  version += 1;
  return REPO + version;
}

exports.push = function(repo, callback) {
  if (!repo) {
    repo = repoN();
  }
  var cmd = util.format('git push http://127.0.0.1:%d/%s master:master', port, repo);
  // Must be async... or we block ourselves from receiving
  ex(cmd, function() {
    if (callback) {
      return callback.apply(this, arguments);
    }
  });
  return repo;
};

exports.pushTarball = function(repo, callback) {
  if (!repo) {
    repo = repoN();
  }

  var cmd = "npm pack";
  ex(cmd, function() {
    cmd = util.format('curl -X PUT --data-binary @test-app-0.0.0.tgz http://127.0.0.1:%d/%s ', port, repo);

    ex(cmd, function() {
      if (callback) {
        return callback();
      }
    });
  });

  return repo;
};

exports.localDeploy = function(dirPath, repo, callback) {
  var cmd = [
      'curl',
      '-H "Content-Type: application/x-pm-deploy"',
      '-X POST',
      '--data \'{ "local-directory": "' +
      dirPath +
      '" }\'',
      util.format('http://127.0.0.1:%d/%s', port, repo)
    ].join(' ');

  ex(cmd, function() {
    if (callback) return callback();
  });
};
