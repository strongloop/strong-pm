'use strict';

var _ = require('lodash');
var debug = require('debug')('strong-pm:test');
var DockerDriver = require('../lib/drivers/docker');
var driverHelpers = require('./driver-helpers');
var EE = require('events').EventEmitter;
var inherits = require('util').inherits;
var tap = require('tap');

var debugConsole = {
  log: debug,
  error: debug,
};

var mockServer = {
  port: _.constant(0),
  getDriverInfo: _.constant({type: 'docker'}),
};
var mockRouter = {
  acceptClient: _.constant({
    getToken: _.constant('abc'),
  }),
  path: '/test',
};

tap.test('DockerDriver constructor API', function(t) {
  driverHelpers.testConstructor(t, DockerDriver);
  t.end();
});

tap.test('DockerDriver instance API', function(t) {
  var docker = new DockerDriver({
    baseDir: 'BASE',
    console: {},
    server: mockServer,
    wsRouter: mockRouter,
  });
  driverHelpers.testInstance(t, docker);
  t.end();
});

tap.test('Docker containers', function(t) {
  var docker = new DockerDriver({
    baseDir: 'BASE',
    console: {},
    server: mockServer,
    wsRouter: mockRouter,
  });
  var instance = docker._instance(1);
  t.assert('startOpts' in instance, 'instnace has startOpts');
  t.assert('log' in instance, 'instance has log buffer');
  t.end();
});

tap.test('DockerDriver#start', function(t) {
  var pulledImages = [];
  var gotInfo = false;
  var listeners = [];
  var images = [];
  var commits = [];
  var mockDocker = {
    info: function(cb) {
      gotInfo = true;
      cb(null, {NCPUS: 2});
    },
    pull: function(name, opts, cb) {
      pulledImages.push(name);
      cb(null);
    },
    modem: {
      followProgress: function(_str, cb) {
        cb();
      },
    },
    getImage: function() {
      return {
        inspect: function(cb) {
          cb(null, {});
        },
      };
    },
  };
  function MockImage(driver, svcDir) {
    EE.call(this);
    images.push(svcDir);
    this.on('commit', function(c) {
      commits.push(c);
    });
    this.on('newListener', function(e) {
      listeners.push(e);
    });
  }
  inherits(MockImage, EE);
  var docker = new DockerDriver({
    baseDir: 'BASE',
    console: debugConsole,
    server: mockServer,
    docker: mockDocker,
    Image: MockImage,
    wsRouter: mockRouter,
  });

  var metas = {
    1: {
      commit: {
        hash: 'abcdef123456',
        dir: __dirname,
      },
    },
  };

  docker.start(metas, function(err) {
    t.ifError(err, 'should not error on startup');
    t.equal(pulledImages.length, 2, 'attempted to pull 2 base images');
    t.assert(gotInfo, 'polled docker server info on startup');
    t.equal(images.length, 1, 'creates image for instance 1');
    t.deepEqual(listeners, ['error', 'image'], 'driver listens for image');
    t.deepEqual(commits, [metas['1'].commit], 'Image for instnace 1 commit');
    t.end();
  });
});

tap.test('DockerDriver#setStartOptions', function(t) {
  var docker = new DockerDriver({
    baseDir: 'BASE',
    console: debugConsole,
    server: mockServer,
    wsRouter: mockRouter,
  });
  var requests = [];
  docker.requestOfInstance = function(id, req) {
    requests.push(req);
  };
  docker._instance(1).startOpts.size = 1;
  docker._instance(2).startOpts.size = 42;
  docker.setStartOptions(1, {foo: 'bar', size: 42});
  docker.setStartOptions(2, {foo: 'bar', size: 42});
  t.equal(docker._instance(1).startOpts.foo, 'bar', 'sets foo option');
  t.deepEqual(requests, [{cmd: 'set-size', size: 42}],
              'tries to resize instance 1 but not instance 2');
  t.end();
});
