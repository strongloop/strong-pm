// Exit on loss of parent process, if it had established an ipc control channel.
// We do this ASAP because we don't want child processes to leak, outliving
// their parent. If the parent has not established an 'ipc' channel to us, this
// will be a no-op, the disconnect event will never occur.
process.on('disconnect', function() {
  process.exit(2);
});

var Parser = require('posix-getopt').BasicParser;
var assert = require('assert');
var debug = require('debug')('strong-pm');
var mkdirp = require('mkdirp').sync;
var path = require('path');
var fs = require('fs');

var runner = require('./lib/run');
var Server = require('./lib/server');

function printHelp($0, prn) {
  var USAGE = fs.readFileSync(require.resolve('./bin/sl-pm.txt'), 'utf-8')
    .replace(/%MAIN%/g, $0)
    .trim()
    ;

  prn(USAGE);
}

function main(argv, callback) {
  var $0 = process.env.CMD ?  process.env.CMD : path.basename(argv[1]);
  var parser = new Parser([
      ':v(version)',
      'h(help)',
      'b:(base)',
      'c:(config)',
      'l:(listen)',
      'C:(control)',
      'N(no-control)',
      'F',
    ].join(''),
    argv);

  var base = '.strong-pm';
  var config;
  var listen;
  var control = 'pmctl';
  var fake;

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
        config = option.optarg;
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
      default:
        console.error('Invalid usage (near option \'%s\'), try `%s --help`.',
          option.optopt, $0);
        return callback(Error('usage'));
    }
  }

  base = path.resolve(base);

  if (control)
    control = path.resolve(control);

  if (config == null) {
    config = path.resolve(base, 'config');
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

  var app = new Server($0, config, base, listen, control);

  app.on('listening', function(listenAddr){
    console.log('%s: listen on %s, work base is `%s` with config `%s`',
      $0, listenAddr.port, base, config);
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
