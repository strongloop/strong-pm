#!/usr/bin/env node

var Parser = require('posix-getopt').BasicParser;
var assert = require('assert');
var client = require('strong-control-channel/client');
var debug = require('debug')('strong-pm:pmctl');
var fs = require('fs');
var path = require('path');
var sprintf = require('extsprintf').sprintf;
var util = require('util');

var USAGE = [
  'usage: %s [options] [command]',
  '',
  'Run-time control of the process manager.',
  '',
  'Options:',
  '  -h,--help               Print help and exit.',
  '  -v,--version            Print version and exit.',
  '',
  'Commands:',
  '  status                  Report status, the default command.',
  '  shutdown                Stop the process manager.',
  '  start                   Start the current application.',
  '  stop                    Hard stop the current application.',
  '  soft-stop               Soft stop the current application.',
  '  restart                 Hard stop and restart the current application with new config.',
  '  soft-restart            Soft stop and restart the current application with new config.',
  '  cluster-restart         Restart the current application cluster workers.',
  '  set-size N              Set cluster size to N workers.',
  '  objects-start T         Start tracking objects on T, a worker ID or process PID.',
  '  objects-stop T          Stop tracking objects on T.',
  '  cpu-start T             Start CPU profiling on T, use cpu-stop to save profile.',
  '  cpu-stop T [NAME]       Stop CPU profiling on T, save as `NAME.cpuprofile`.',
  '  heap-snapshot T [NAME]  Save heap snapshot on T, save as `NAME.heapsnapshot`.',
  '',
  '"Soft" stops notify workers they are being disconnected, and give them a',
  'grace period for any existing connections to finish. "Hard" stops kill the',
  'supervisor and its workers with `SIGTERM`.',
  '',
  'Profiling:',
  '',
  'Either a node cluster worker ID, or an operating system process',
  'ID can be used to identify the node instance to target to start',
  'profiling of objects or CPU. The special worker ID `0` can be used',
  'to identify the master.',
  '',
  'Object tracking is published as metrics, and requires configuration',
  'so that the `--metrics=URL` option is passed to the runner.',
  '',
  'CPU profiles must be loaded into Chrome Dev Tools. The NAME is',
  'optional, profiles default to being named `node.<PID>.cpuprofile`.',
  '',
  'Heap snapshots must be loaded into Chrome Dev Tools. The NAME is',
  'optional, snapshots default to being named `node.<PID>.heapsnapshot`.',
].join('\n');

function printHelp($0, prn) {
  prn(USAGE, $0);
}

var argv = process.argv;
var $0 = process.env.CMD || path.basename(argv[1]);
var parser = new Parser([
  ':v(version)',
  'h(help)',
  'C:(control)',
].join(''), argv);
var pmctl = fs.existsSync('pmctl') ? 'pmctl' : '/var/lib/strong-pm/pmctl';
var command = 'status';

while ((option = parser.getopt()) !== undefined) {
  switch (option.option) {
    case 'v':
      console.log(require('../package.json').version);
      process.exit(0);
    case 'h':
      printHelp($0, console.log);
      process.exit(0);
    case 'C':
      pmctl = option.optarg;
      break;
    default:
      console.error('Invalid usage (near option \'%s\'), try `%s --help`.',
        option.optopt, $0);
      process.exit(1);
  }
}

var optind = parser.optind();

if (optind < argv.length) {
  command = argv[optind++];
}

var commands = {
  status: cmdStatus,
  shutdown: cmdShutdown,
  start: cmdStart,
  stop: cmdStop,
  'soft-stop': cmdSoftStop,
  restart: cmdRestart,
  'soft-restart': cmdSoftRestart,
  'cluster-restart': cmdClusterRestart,
  'set-size': cmdSetSize,
  'objects-start': cmdObjectsStart,
  'objects-stop': cmdObjectsStop,
  'cpu-start': cmdCpuStart,
  'cpu-stop': cmdCpuStop,
  'heap-snapshot': cmdHeapSnapshot,
};

(commands[command] || cmdInvalid)();

function cmdInvalid() {
  console.error('Invalid usage (unknown command `%s`), try `%s --help`.',
    command, $0);
  process.exit(1);
}

function cmdStatus() {
  checkExtra();

  request('status', function(rsp) {
    function fmt(depth, tag /*...*/) {
      var value = util.format.apply(util, [].slice.call(arguments, 2));
      var width = 22 - 2 * depth;
      if (value.length > 0)
        var line = sprintf(w(depth) + '%-' + width + 's%s', tag + ':', value);
      else
        var line = w(depth) + tag + ':';
      console.log(line);
      function w(depth) {
        return sprintf('%' + (2 * depth) + 's', '');
      }
    }
    fmt(0, 'manager');
    fmt(1, 'pid', '%s', rsp.pid);
    fmt(1, 'port', '%s', rsp.port);
    fmt(1, 'base', '%s', rsp.base); // FIXME resolve
    fmt(1, 'config', '%s', rsp.config); // FIXME relative to BASE

    var current = rsp.current;

    if (!rsp.current) {
      fmt(0, 'current', '(none)');
      return;
    }

    var workers = current.workers;
    var config = current.config;
    var files = config.files;

    fmt(0, 'current');
    fmt(1, 'status', current.pid ? 'started' : 'stopped');
    if (current.pid)
      fmt(1, 'pid', '%s', current.pid);

    fmt(1, 'link', '%s', current.pwd);
    fmt(1, 'current', '%s',
      path.relative(path.resolve(current.pwd, '..'), current.cwd));
    if (current.branch) {
      fmt(1, 'branch', '%s', current.branch);
    }

    fmt(1, 'worker count', '%d', workers ? workers.length : 0);
    if (workers) {
      for(var i = 0; i < workers.length; i++) {
        var worker = workers[i];
        var id = worker.id;
        var pid = worker.pid;
        fmt(2, util.format('[%d]', i + 1), 'cluster id %s, pid %d', id, pid);
      }
    }

    fmt(1, 'config', '%s', current.repo);

    fmt(2, 'start command', '%s', config.start[0]);
    fmt(2, 'stop signal', '%s', config.stop[0]);
    fmt(2, 'replace signal', '%s', config.replace[0]);

    if (files && Object.keys(files).length > 0) {
      fmt(2, 'files');
      Object.keys(files).sort().forEach(function(dst) {
        var src = files[dst];
        var srcFull = path.resolve(config.configFile, '..', src);
        fmt(3, dst, '(from) %s', srcFull)
      });
    }
  });
}

function cmdShutdown() {
  simpleCommand('pm-stop');
}

function cmdStart() {
  simpleCommand('start');
}

function cmdStop() {
  simpleCommand('stop');
}

function cmdSoftStop() {
  simpleCommand('soft-stop');
}

function cmdRestart() {
  simpleCommand('restart');
}

function cmdSoftRestart() {
  simpleCommand('soft-restart');
}

function cmdClusterRestart() {
  checkExtra();

  request(ofApp({cmd: 'restart'}), function(rsp) {
  });
}

function cmdSetSize() {
  var arg = parseInt(checkOne('N'));
  checkExtra();

  request(ofApp({cmd: 'set-size', size: arg}), function(rsp) {
  });
}

function cmdObjectsStart() {
  var t = checkOne('T');
  checkExtra();

  request(ofApp({cmd: 'start-tracking-objects', target: t}), function(rsp) {
  });
}

function cmdObjectsStop() {
  var t = checkOne('T');
  checkExtra();

  request(ofApp({cmd: 'stop-tracking-objects', target: t}), function(rsp) {
  });
}

function cmdCpuStart() {
  var t = checkOne('T');
  checkExtra();

  request(ofApp({cmd: 'start-cpu-profiling', target: t}), function(rsp) {
    console.log('Profiler started, use cpu-stop to get profile');
  });
}

function cmdCpuStop() {
  var t = checkOne('T');
  var name = optionalOne(util.format('node.%s', t));
  checkExtra();

  request(ofApp({cmd: 'stop-cpu-profiling', target: t}), function(rsp) {
    var filename = name + '.cpuprofile'; // Required by Chrome
    fs.writeFileSync(filename, rsp.profile);
    console.log('CPU profile written to `%s`, load into Chrome Dev Tools',
                filename);
  });
}

function cmdHeapSnapshot() {
  var t = checkOne('T');
  var name = optionalOne(util.format('node.%s', t)) + '.heapsnapshot';
  checkExtra();

  var req = { cmd: 'heap-snapshot', target: t, filePath: path.resolve(name)};
  request(ofApp(req), function(rsp) {
    console.log('Heap snapshot written to `%s`, load into Chrome Dev Tools',
                name);
  });
}

function simpleCommand(cmd) {
  checkExtra();

  request(cmd, function(rsp) {
    console.log(rsp.message);
  });
}

function request(cmd, display) {
  if (!cmd.cmd) {
    cmd = {cmd: cmd};
  }

  client.request(pmctl, cmd, function(er, rsp) {
    if (er) {
      console.error('Communication error (%s), check manager is listening.',
        er.message);
      process.exit(1);
    }

    if (rsp.error) {
      console.log('Command `%s` failed with: %s', cmd.cmd, rsp.error);
      process.exit(1);
    }
    display(rsp);
    process.exit(0);
  });
}

function ofApp(obj) {
  obj.sub = obj.cmd;
  obj.cmd = 'current';
  return obj;
}

function checkExtra() {
  if (optind < argv.length) {
    extra();
  }
}

function checkOne(name) {
  if (optind >= argv.length) {
    console.error(
      'Invalid usage (missing required argument `%s`), try `%s --help`.',
      name,
      $0);
    process.exit(1);
  }
  return argv[optind++];
}

function optionalOne(default_) {
  if (optind < argv.length) {
    return argv[optind++];
  }
  return default_;
}

function extra() {
  console.error('Invalid usage (extra arguments), try `%s --help`.', $0);
  process.exit(1);
}
