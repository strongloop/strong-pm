'use strict';

var Driver = require('../lib/drivers/direct/direct-driver');
var _ = require('lodash');
var debug = require('debug')('strong-pm:test');
var fmt = require('util').format;
var mktmpdir = require('mktmpdir');
var path = require('path');
var tap = require('tap');

tap.test('driver mandatory options', function(t) {
  var baseDir = 'BASE';
  var server = {};
  var logger = {};
  t.doesNotThrow(function() {
    new Driver({
      baseDir: baseDir,
      console: logger,
      server: server,
    });
  });
  t.throws(function() {
    new Driver({
      console: logger,
      server: server,
    });
  });
  t.throws(function() {
    new Driver({
      baseDir: baseDir,
      server: server,
    });
  });
  t.throws(function() {
    new Driver({
      baseDir: baseDir,
      console: logger,
    });
  });
  t.end();
});

tap.test('start runs last services', function(t) {
  var server = {};
  var services = [
    '11111',
    'a3f55e8c-de43-11e4-9b68-b3b7dd588a5b',
    'aaaa',
  ];
  var d = new Driver({
    Container: Container,
    baseDir: path.resolve(__dirname, 'direct-driver-workdir'),
    console: console,
    server: server,
  });
  function Container(options) {
    return {
      on: function() {},
      runCurrent: function(callback) {
        t.assert(_.indexOf(services, options.svcId) >= 0, 'run each svc once');
        _.pull(services, options.svcId);
        return callback();
      },
    }
  }

  t.plan(5);

  d.start(function(er) {
    t.ifError(er);
    t.equal(Object.keys(d._containers).length, 3);
  });
});

tap.test('start does nothing with no last services', function(t) {
  mktmpdir(function (err, dir, done) {
    t.on('end', done);

    var server = {};
    var d = new Driver({
      Container: Container,
      baseDir: dir,
      console: console,
      server: server,
    });
    function Container(options) {
      t.assert(false, 'should be no services found');
    }

    t.plan(2);

    d.start(function(er) {
      t.ifError(er);
      t.equal(Object.keys(d._containers).length, 0);
    });
  });
});

tap.test('stop applied to all services', function(t) {
  var server = {};
  var logger = {};

  var d = new Driver({
    Container: Container,
    baseDir: __dirname,
    console: logger,
    server: server,
  });

  function Container(options) {
    return {
      on: function() {},
      stop: function() { this.stopped = true; },
    };
  }

  t.plan(4);

  t.doesNotThrow(function() {
    d.stop();
  }, 'stop with no containers');

  var c1 = d._containerById('1');
  var c2 = d._containerById('2');
  var c3 = d._containerById('3');

  d.stop(function() {
    t.assert(c1.stopped);
    t.assert(c2.stopped);
    t.assert(c3.stopped);
  });
});

tap.test('containerById', function(t) {
  var server = {};
  var logger = {};

  var d = new Driver({
    Container: Container,
    baseDir: __dirname,
    console: logger,
    server: server,
  });
  var _c = {
    on: function(event) {
      t.equal(event, 'request');
    },
  };

  function Container(options) {
    t.equal(options.baseDir, __dirname);
    t.equal(options.console, logger);
    t.equal(options.server, server);
    t.equal(options.svcId, 'id');
    return _c;
  }

  t.plan(6);

  var c = d._containerById('id');

  t.equal(c, _c);
});

function testPassThru(method, args) {
  tap.test(fmt('driver passes %s to container', method), function(t) {
    var server = {};
    var logger = {};
    var options = {};
    var d = new Driver({
      Container: Container,
      baseDir: __dirname,
      console: logger,
      server: server,
    });
    var svcId = 'x-z';

    function Container(options) {
      t.equal(options.svcId, svcId);
      var c= {
        on: function() {},
      };
      c[method] = function(arg1, arg2) {
        t.equal(arg1, args[1]);
        t.equal(arg2, args[2]);
      };
      return c;
    }

    t.plan(3);

    args.unshift(svcId);

    d[method].apply(d, args);
  });
}

testPassThru('setStartOptions', [{/*options*/}]);

testPassThru('onDeployment', [{/*req*/}, {/*res*/}]);

testPassThru('updateEnv', [{/*env*/}]);
tap.test('container requests are emitted on the driver', function(t) {
  var server = {};
  var logger = {};
  var request = {cmd: 'some-cmd'};

  var d = new Driver({
    Container: Container,
    baseDir: __dirname,
    console: logger,
    server: server,
  });

  var c = {
    on: function(event, listener) {
      t.equal(event, 'request');
      debug('on: %j %s', event, listener);

      process.nextTick(function() {
        debug('call');
        listener(request);
      });
    },
  };

  function Container(options) {
    c.svcId = options.svcId;
    return c;
  }

  t.plan(3);

  d.on('request', function(_c, _request) {
    debug('on request: %j %j', _c, _request);
    t.equal(_c, c);
    t.equal(_request, request);
  });

  d._containerById('some-id');
});
