#!/usr/bin/env node

var Parser = require('posix-getopt').BasicParser;
var assert = require('assert');
var client = require('strong-control-channel/client');
var concat = require('concat-stream');
var debug = require('debug')('strong-pm:pmctl');
var fs = require('fs');
var http = require('http');
var loopback = require('loopback');
var loopbackBoot = require('loopback-boot');
var npmls = require('strong-npm-ls');
var path = require('path');
var sprintf = require('extsprintf').sprintf;
var url = require('url');
var util = require('util');
var _ = require('lodash');

function printHelp($0, prn) {
  var USAGE = fs.readFileSync(require.resolve('./sl-pmctl.txt'), 'utf-8')
    .replace(/%MAIN%/g, $0)
    .trim()
    ;

  prn(USAGE);
}

var argv = process.argv;
var $0 = process.env.CMD || path.basename(argv[1]);
var parser = new Parser([
  ':v(version)',
  'h(help)',
  'C:(control)',
].join(''), argv);
var pmctl = process.env.STRONGLOOP_PM ?
  process.env.STRONGLOOP_PM :
  fs.existsSync('pmctl') ?
    'pmctl' :
    '/var/lib/strong-pm/pmctl';
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

var remote = {
  request: remoteRequest,
};
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
  ls: cmdLs,
  'env-set': cmdEnvSet,
  'env-get': cmdEnvGet,
  env: cmdEnvGet,
  'env-unset': cmdEnvUnset,
  'log-dump': cmdLogDump,
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
    fmt(1, 'base', '%s', rsp.base);
    fmt(1, 'config', '%s', rsp.config);

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
  var t = checkOne('ID');
  checkExtra();

  request(ofApp({cmd: 'start-tracking-objects', target: t}), function(rsp) {
  });
}

function cmdObjectsStop() {
  var t = checkOne('ID');
  checkExtra();

  request(ofApp({cmd: 'stop-tracking-objects', target: t}), function(rsp) {
  });
}

function cmdCpuStart() {
  var t = checkOne('ID');
  var timeout = optionalOne(0) | 0;
  checkExtra();

  request(ofApp({cmd: 'start-cpu-profiling', target: t, timeout: timeout}),
    function(rsp) {
      console.log('Profiler started, use cpu-stop to get profile');
    });
}

function cmdCpuStop() {
  var t = checkOne('ID');
  var name = optionalOne(util.format('node.%s', t)) + '.cpuprofile';
  checkExtra();

  var req = {
    cmd: 'stop-cpu-profiling',
    target: t,
    filePath: path.resolve(name)
  };
  request(ofApp(req), function(rsp) {
    console.log('CPU profile written to `%s`, load into Chrome Dev Tools',
                name);
  });
}

function cmdHeapSnapshot() {
  var t = checkOne('ID');
  var name = optionalOne(util.format('node.%s', t)) + '.heapsnapshot';
  checkExtra();

  var req = { cmd: 'heap-snapshot', target: t, filePath: path.resolve(name)};
  request(ofApp(req), function(rsp) {
    console.log('Heap snapshot written to `%s`, load into Chrome Dev Tools',
                name);
  });
}

function cmdLs() {
  var depth = optionalOne(Number.MAX_VALUE);
  checkExtra();

  request(ofApp({cmd: 'npm-ls'}), function(rsp) {
    console.log(npmls.printable(rsp, depth));
  });
}

function cmdEnvSet() {
  var vars = checkSome('K=V');
  var env = _.reduce(vars, extractKeyValue, {});

  request({cmd: 'env-set', env: env}, function(rsp) {
    console.log('Environment updated: %s', rsp.message);
  });

  function extractKeyValue(store, pair) {
    var kv = pair.split('=');
    if (!kv[0] || !kv[1]) {
      console.error('Invalid usage (not K=V format: `%s`), try `%s --help`.',
                    pair, $0);
      process.exit(1);
    }
    store[kv[0]] = kv[1];
    return store;
  }
}

function cmdEnvUnset() {
  var keys = checkSome('KEYS');
  var nulls = _.map(keys, _.constant(null));
  var nulledKeys = _.zipObject(keys, nulls);

  // unset is set, but with null values, which indicate delete
  request({cmd: 'env-set', env: nulledKeys }, function(rsp) {
    console.log('Environment updated: %s', rsp.message);
  });
}

function cmdEnvGet() {
  var vars = optionalSome('K');
  request({cmd: 'env-get'}, function(rsp) {
    var filtered = vars.length > 0 ? _.pick(rsp.env, vars) : rsp.env;
    console.log('Environment variables:');
    if (_.keys(filtered).length === 0) {
      console.log('  No matching environment variables defined');
    } else {
      _(filtered).keys().sort().each(function(k) {
        console.log(' %s=%s', k, filtered[k]);
      });
    }
  });
}

function cmdLogDump() {
  var repeat = (optionalOne('NOFOLLOW') === '--follow');

  return logDump();

  function logDump() {
    request({ cmd: 'log-dump' }, function(rsp) {
      if (rsp.message) {
        console.error(rsp.message);
      } else {
        process.stdout.write(rsp.log);
      }
      if (repeat) {
        setTimeout(logDump, 1000);
      }
      return repeat;
    });
  }
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

  remote.request(pmctl, cmd, function(er, rsp) {
    if (er) {
      console.error('Communication error (%s), check manager is listening.',
        er.message);
      process.exit(1);
    }

    if (rsp.error) {
      console.log('Command `%s` failed with: %s', cmd.sub || cmd.cmd, rsp.error);
      process.exit(1);
    }
    var keepAlive = display(rsp);
    if (!keepAlive) {
      process.exit(0);
    }
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

function checkSome(name) {
  if (optind >= argv.length) {
    console.error(
      'Invalid usage (missing required argument `%s`), try `%s --help`.',
      name,
      $0);
    process.exit(1);
  }
  return argv.slice(optind);
}

function optionalOne(default_) {
  if (optind < argv.length) {
    return argv[optind++];
  }
  return default_;
}

function optionalSome() {
  if (optind < argv.length) {
    return argv.slice(optind);
  }
  return [];
}

function extra() {
  console.error('Invalid usage (extra arguments), try `%s --help`.', $0);
  process.exit(1);
}

function remoteRequest(pmctl, cmd, callback) {
  var endpoint = url.parse(pmctl);

  if (!endpoint.protocol) {
    return client.request(pmctl, cmd, callback);
  }

  // Normalize the URI
  debug('normalize endpoint %j', endpoint);
  endpoint.pathname = '/api'; // Loopback is mounted here
  endpoint.hostname = endpoint.hostname || 'localhost'; // Allow `http://:8888`
  delete endpoint.host; // So .hostname and .port are used to construct URL
  pmctl = url.format(endpoint);

  debug('http endpoint `%s`', pmctl);

  var lb = loopback();
  lb.dataSource('remote', {'connector': 'remote', 'url': pmctl});
  loopbackBoot(lb, {'appRootDir': path.join(__dirname, '..', 'lib', 'client')});

  // XXX 'action' should be called 'cmd', IMO
  var ServiceInstance = lb.models.ServiceInstance;
  var InstanceAction = lb.models.InstanceAction;

  ServiceInstance.findById(1, function(err, instance) {
    if (err) {
      console.error('Failed to find service at `%s`: %s', pmctl, err.message);
      process.exit(1);
    }

    var action = {
      request: cmd,
    };

    instance.actions.create(new InstanceAction(action), function(err, action) {
      checkError(err);

      debug('remote action result: %j', action);

      switch (cmd.sub) {
        case 'stop-cpu-profiling':
        case 'heap-snapshot': {
          download(endpoint, action.result.url, cmd.filePath, downloaded);
          break;
        }
        default:
          return callback(null, action.result);
      }

      function downloaded(err) {
        checkError(err);
        return callback(null, action.result);
      }

      function checkError(err) {
        if (err) {
          console.error('Command `%s` failed: %s',
            cmd.sub || cmd.cmd, err.message);
          process.exit(1);
        }
      }
    });
  });
}

function download(endpoint, path, file, callback) {
  endpoint.pathname = path;
  location = url.format(endpoint);

  // TODO: add support for Digest auth, which is probably easiest done by
  //       switching to the request module
  //       see test/test-pmctl-rest-digest-auth.js
  var get = http.get(location, function(res) {
    debug('http.get: %d', res.statusCode);

    switch (res.statusCode) {
      case 200: {
        var out = fs.createWriteStream(file);
        res.once('error', callback);
        out.once('error', callback);
        out.once('finish', callback);
        res.pipe(out);
        break;
      }
      case 204: {
        // No content, keep polling until completed or errored
        setTimeout(function() {
          download(endpoint, path, file, callback);
        }, 200);
        break;
      }
      default: {
        // Collect response stream to use as error message.
        var out = concat(function(data) {
          callback(Error(util.format('code %d/%s',
            res.statusCode, data)));
        });
        res.once('error', callback);
        out.once('error', callback);
        res.pipe(out);
      }
    }
  });

  get.once('error', callback);
}
