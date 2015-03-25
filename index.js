'use strict';

var Parser = require('posix-getopt').BasicParser;
var assert = require('assert');
var mkdirp = require('mkdirp').sync;
var path = require('path');
var fs = require('fs');

var Server = require('./lib/server');

function printHelp($0, prn) {
  var USAGE = fs.readFileSync(require.resolve('./bin/sl-pm.txt'), 'utf-8')
    .replace(/%MAIN%/g, $0)
    .trim();

  prn(USAGE);
}

function main(argv, callback) {
  var $0 = process.env.CMD ? process.env.CMD : path.basename(argv[1]);
  var parser = new Parser([
      ':v(version)',
      'h(help)',
      'b:(base)',
      'c:(config)', // unused. left in so Upstart/systemd jobs don't crash
      'l:(listen)',
      'C:(control)',
      'N(no-control)',
      'T(trace)',
      'F',
    ].join(''),
    argv);

  var base = '.strong-pm';
  var enableTracing = false;
  var listen = 8701;
  var control = 'pmctl';
  var fake;

  var option;
  while ((option = parser.getopt()) !== undefined) {
    switch (option.option) {
      case 'v':
        console.log(require('./package.json').version);
        return callback();
      case 'h':
        printHelp($0, console.log);
        return callback();
      case 'b':
        base = option.optarg;
        break;
      case 'c':
        console.error('Warning: ignoring config file: ', option.optarg);
        break;
      case 'l':
        listen = option.optarg;
        break;
      case 'C':
        control = option.optarg;
        break;
      case 'N':
        control = undefined;
        break;
      case 'F':
        fake = true;
        break;
      case 'T':
        enableTracing = true;
        break;
      default:
        console.error('Invalid usage (near option \'%s\'), try `%s --help`.',
          option.optopt, $0);
        return callback(Error('usage'));
    }
  }

  base = path.resolve(base);

  if (control) {
    control = path.resolve(control);

    if (process.platform === 'win32' && !/^[\/\\]{2}/.test(control))
      control = '\\\\?\\pipe\\' + control;
  }

  if (parser.optind() !== argv.length) {
    console.error('Invalid usage (extra arguments), try `%s --help`.', $0);
    return callback(Error('usage'));
  }

  if (listen == null) {
    console.error('Listen port was not specified, try `%s --help`.', $0);

    return callback(true);
  }

  // Run from base directory, so files and paths are created in it.
  mkdirp(base);
  process.chdir(base);

  var app = new Server($0, base, listen, control, enableTracing);

  app.on('listening', function(listenAddr) {
    console.log('%s: listen on %s, work base is `%s`',
      $0, listenAddr.port, base);
    if (fake) _fakeMetrics(app);
  });

  app.start();

  // XXX stop just signals the supervisor with SIGTERM, and closes sockets.
  // the socket close won't even complete while there are open connections...,
  // which may happen if exec keeps a persistent ipc connection on pm. I'm
  // not sure there is any point to this anymore, now what we only support
  // supervisor as a runner, and supervisor exits when the parent exits. I think
  // we can just let the signal terminate us, the OS will close sockets, and
  // supervisor will exit itself.
  //
  // A fair amount of code dribbles down from this point that could be deleted.
  stopWhenDone($0, app);

  return app;
}

function stopWhenDone($0, app) {
  function dieBy(signal) {
    console.log('%s: stopped with %s', $0, signal);
    app.stop();

    // re-kill ourself, so our exit status is signaled
    process.kill(process.pid, signal);
  }

  function dieOn(signal) {
    process.once(signal, dieBy.bind(null, signal));
  }

  dieOn('SIGHUP'); // XXX(sam) should this do a restart?
  dieOn('SIGINT');
  dieOn('SIGTERM');

  process.on('exit', function() {
    app.stop();
  });
}

function _fakeMetrics(server) {
  console.error('start faking metrics');

  var m = server._app.models;

  m.ServiceInstance.upsert({
    id: 1,
    executorId: 1,
    serverServiceId: 1,
    groupId: 1,
    currentDeploymentId: 'fake-sha',
    deploymentStartTime: new Date(),
    PMPort: server._listenPort,
  }, function(err, obj) {
    console.error('fake upsert ServiceInstance: %j', err || obj);
  });

  m.ServiceProcess.upsert({
    id: 1, pid: 42, workerId: 0
  }, function(err, obj) {
    console.error('fake upsert ServerProcess:', err || obj);
    assert.ifError(err);
    assert.equal(obj.id, 1);
  });

  function getRandomArbitrary(min, max) {
    return Math.random() * (max - min) + min;
  }
  function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min)) + min;
  }

  setInterval(function() {
    m.ServiceMetric.upsert({
      processId: 1,
      timeStamp: new Date(),
      counters: {},
      gauges: {
        'cpu.system': getRandomArbitrary(1.1, 89.4),
        'cpu.user': getRandomArbitrary(1.1, 9.4),
        'cpu.total': getRandomArbitrary(12.3, 99.1),
        'heap.total': getRandomInt(1000, 99999),
        'heap.used': getRandomInt(225, 989),
        'loop.count': getRandomInt(100, 500),
        'loop.maximum': getRandomInt(78, 100),
        'loop.minimum': getRandomInt(1, 12),
        'loop.average': getRandomInt(13, 78)
      }
    }, function(err, obj) {
      console.error('fake upser ServiceMetric:', err || obj);
    });
  }, 15 * 1000);

  return;
}

exports.main = main;
