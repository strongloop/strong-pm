#!/usr/bin/env node
'use strict';

// Exit on loss of parent process, if it had established an ipc control channel.
// We do this ASAP because we don't want child processes to leak, outliving
// their parent. If the parent has not established an 'ipc' channel to us, this
// will be a no-op, the disconnect event will never occur.
process.on('disconnect', function() {
  process.exit(2);
});

var Parser = require('posix-getopt').BasicParser;
var home = require('userhome');
var mkdirp = require('mkdirp').sync;
var path = require('path');
var fs = require('fs');

var DRIVERS = {
  direct: require('../lib/drivers/direct'),
  docker: require('../lib/drivers/docker'),
};

var Server = require('../lib/server');

function printHelp($0, prn) {
  var USAGE = fs.readFileSync(require.resolve('./sl-pm.txt'), 'utf-8')
    .replace(/%MAIN%/g, $0)
    .trim();

  prn(USAGE);
}

var argv = process.argv;
var $0 = process.env.CMD ? process.env.CMD : path.basename(argv[1]);
var parser = new Parser([
    ':v(version)',
    'h(help)',
    'b:(base)',
    'c:(config)', // unused. left in so Upstart/systemd jobs don't crash
    'd:(driver)',
    'l:(listen)',
    'N:(no-control)', // unused. left for backwards compat.
  ].join(''),
  argv);

var base = home('.strong-pm');
var listen = 8701;
var driver = DRIVERS.direct;

var option;
while ((option = parser.getopt()) !== undefined) {
  switch (option.option) {
    case 'v':
      console.log(require('../package.json').version);
      process.exit();
      break;
    case 'h':
      printHelp($0, console.log);
      process.exit();
      break;
    case 'b':
      base = option.optarg;
      break;
    case 'c':
      console.error('Warning: ignoring config file: ', option.optarg);
      break;
    case 'd':
      driver = DRIVERS[option.optarg.toLowerCase()];
      break;
    case 'l':
      listen = option.optarg;
      break;
    case 'N':
      break;
    default:
      console.error('Invalid usage (near option \'%s\'), try `%s --help`.',
        option.optopt, $0);
      process.exit(1);
  }
}

base = path.resolve(base);

if (parser.optind() !== argv.length) {
  console.error('Invalid usage (extra arguments), try `%s --help`.', $0);
  process.exit(1);
}

if (listen == null) {
  console.error('Listen port was not specified, try `%s --help`.', $0);
  process.exit(1);
}

// Run from base directory, so files and paths are created in it.
mkdirp(base);
process.chdir(base);

var app = new Server({
  // Choose driver based on cli options/env once we have alternate drivers.
  Driver: driver,
  cmdName: $0,
  baseDir: base,
  listenPort: listen,
});

app.on('listening', function(listenAddr) {
  console.log('%s: listen on %s, work base is `%s`, driver is `%s`',
    $0, listenAddr.port, base, app.getDriverInfo().type);
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


function stopWhenDone(/*$0, app*/) {
  /*
  // XXX(sam) I can't rember why we do this, especially since we don't wait for
  // stop to complete, and just kill ourself right away.
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
  */
}
