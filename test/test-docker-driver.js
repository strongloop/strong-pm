'use strict';

var DockerDriver = require('../lib/drivers/docker');
var driverHelpers = require('./driver-helpers');
var tap = require('tap');

tap.test('DockerDriver constructor API', function(t) {
  driverHelpers.testConstructor(t, DockerDriver);
  t.end();
});

tap.test('DockerDriver instance API', function(t) {
  var docker = new DockerDriver({baseDir: 'BASE', console: {}, server: {}});
  driverHelpers.testInstance(t, docker);
  t.end();
});

tap.test('Docker containers', function(t) {
  var docker = new DockerDriver({baseDir: 'BASE', console: {}, server: {}});
  var instance = docker._instance(1);
  t.assert('startOpts' in instance, 'instnace has startOpts');
  t.assert('log' in instance, 'instance has log buffer');
  t.end();
});
