'use strict';

var Driver = require('../lib/drivers/direct');
var _ = require('lodash');
var debug = require('debug')('strong-pm:test');
var driverHelpers = require('./driver-helpers');
var fmt = require('util').format;
var mktmpdir = require('mktmpdir');
var path = require('path');
var tap = require('tap');

var mockServer = {
  port: _.constant(0),
  getDriverInfo: _.constant({type: 'direct'}),
};
var mockRouter = {
  acceptClient: function(onRequest) {
    this.onRequest = onRequest;
    return {
      getToken: _.constant('abc'),
      on: function() {},
    };
  },
  path: '/test',
};

tap.test('DirectDriver constructor API', function(t) {
  driverHelpers.testConstructor(t, Driver);
  t.end();
});

tap.test('DirectDriver instance API', function(t) {
  var driver = new Driver({
    baseDir: 'BASE',
    console: console,
    server: mockServer,
    wsRouter: mockRouter,
  });
  driverHelpers.testInstance(t, driver);
  t.end();
});

tap.test('start runs last services', function(t) {
  var server = mockServer;
  var instanceMetas = {
    11111: {data: 'some metadata'},
    'a3f55e8c-de43-11e4-9b68-b3b7dd588a5b': {data: 'some metadata'},
    aaaa: {data: 'some metadata'},
  };
  var instanceIds = Object.keys(instanceMetas);
  var d = new Driver({
    Container: Container,
    baseDir: path.resolve(__dirname, 'direct-driver-workdir'),
    console: console,
    server: server,
    wsRouter: mockRouter,
  });
  function Container(options) {
    return {
      on: function() {},
      runCurrent: function(callback) {
        t.assert(
          _.indexOf(instanceIds, options.instanceId) >= 0,
          'run each svc once'
        );
        _.pull(instanceIds, options.instanceId);
        return callback();
      },
      setStartOptions: function(options) {
        t.assert('size' in options || 'control' in options);
      },
    };
  }

  t.plan(8);

  d.start(instanceMetas, function(er) {
    t.ifError(er);
    t.equal(Object.keys(d._containers).length, 3);
  });
});

tap.test('start does nothing with no last services', function(t) {
  t.plan(3);
  mktmpdir(function(err, dir, done) {
    t.ifError(err);
    t.on('end', done);

    var server = {};
    var d = new Driver({
      Container: Container,
      baseDir: dir,
      console: console,
      server: server,
      wsRouter: mockRouter,
    });
    function Container() {
      t.fail('should be no services found');
    }

    d.start({}, function(er) {
      t.ifError(er);
      t.equal(Object.keys(d._containers).length, 0);
    });
  });
});

tap.test('stop applied to all services', function(t) {
  var server = mockServer;
  var logger = {};

  var d = new Driver({
    Container: Container,
    baseDir: __dirname,
    console: logger,
    server: server,
    wsRouter: mockRouter,
  });

  function Container() {
    return {
      on: function() {},
      stop: function() {
        this.stopped = true;
      },
      setStartOptions: _.noop,
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
  var server = mockServer;
  var logger = {};

  var d = new Driver({
    Container: Container,
    baseDir: __dirname,
    console: logger,
    server: server,
    wsRouter: mockRouter,
  });
  var _c = {
    on: function(event) {
      t.equal(event, 'request');
    },
    setStartOptions: _.noop,
  };

  function Container(options) {
    t.equal(options.baseDir, __dirname);
    t.equal(options.console, logger);
    t.equal(options.server, server);
    t.equal(options.instanceId, 'id');
    return _c;
  }

  t.plan(6);

  var c = d._containerById('id');

  t.equal(c, _c);
});

function testPassThru(method, args) {
  tap.test(fmt('driver passes %s to container', method), function(t) {
    var server = mockServer;
    var logger = {};
    var d = new Driver({
      Container: Container,
      baseDir: __dirname,
      console: logger,
      server: server,
      wsRouter: mockRouter,
    });
    var instanceId = 'x-z';

    function Container(options) {
      t.equal(options.instanceId, instanceId);
      var c = {
        on: function() {},
        setStartOptions: _.noop,
      };
      c[method] = function(arg1, arg2) {
        t.equivalent(arg1, args[1]);
        t.equivalent(arg2, args[2]);
      };
      return c;
    }

    t.plan(3);

    args.unshift(instanceId);

    console.assert(d[method]);

    d[method].apply(d, args);
  });
}

testPassThru('setStartOptions', [{control: 'ws://abc@127.0.0.1:0/test'}]);

testPassThru('deployInstance', [{/* req */}, {/* res */}]);

testPassThru('updateInstanceEnv', [{/* env */}]);

tap.test('channel requests are emitted on the driver', function(t) {
  var server = mockServer;
  var logger = {};
  var request = {cmd: 'some-cmd'};

  var d = new Driver({
    Container: Container,
    baseDir: __dirname,
    console: logger,
    server: server,
    wsRouter: mockRouter,
  });

  var c = {
    on: function(event, listener) {
      t.equal(event, 'request');
      debug('on: %j %s', event, listener);
      this.listener = listener;
    },
    emit: function(event, req, callback) {
      t.equal(event, 'request');
      this.listener(req, callback);
    },
    setStartOptions: _.noop,
  };

  var instanceId = 'some-id';

  function Container(options) {
    c.svcId = options.svcId;
    return c;
  }

  t.plan(5);

  t.type(mockRouter.onRequest, 'function');

  process.nextTick(function() {
    debug('call');
    mockRouter.onRequest(request);
  });

  d.on('request', function(_id, _request) {
    debug('on request: %j %j', _id, _request);
    t.equal(_id, instanceId);
    t.equal(_request, request);
  });

  d._containerById(instanceId);
});
