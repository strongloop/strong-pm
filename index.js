var Parser = require('posix-getopt').BasicParser;
var assert = require('assert');
var debug = require('debug')('strong-pm');
var ipcctl = require('./lib/ipcctl');
var path = require('path');
var fs = require('fs');

var configForCommit = require('./lib/config').configForCommit;
var prepare = require('./lib/prepare').prepare;
var receive = require('./lib/receive').listen;
var runner = require('./lib/run');
var cicadaCommit = require('cicada/lib/commit');

function printHelp($0, prn) {
  prn('usage: %s [options]', $0);
  prn('');
  prn('Options:');
  prn('  -h,--help         Print this message and exit.');
  prn('  -v,--version      Print version and exit.');
  prn('  -b,--base BASE    Base directory to work in (default .strong-pm).');
  prn('  -c,--config       Config file (default BASE/config).');
  prn('  -l,--listen PORT  Listen on PORT for git pushes (no default).');
  prn('  -C,--control CTL  Listen for control messages on CTL (default pmctl).');
  prn('  --no-control      Do not listen for control messages.');
}

function runCommand(cmd, callback) {
  debug('run command: %s', cmd);
  shell.exec(cmd, {silent: true}, function(code, output) {
    debug('code %d: <<<\n%s>>>', code, output);
    if (code !== 0) {
      var er = Error(cmd);
    }
    return callback(er, output, code);
  });
}

function reportRunError(er, output) {
  if (!er) return;

  console.error("Failed to run `%s`:", er.message);
  if (output && output !== '') {
    process.stderr.write(output);
  }
}

exports.deploy = function deploy(argv, callback) {
  var $0 = process.env.SLC_COMMAND ?
    'slc ' + process.env.SLC_COMMAND :
    path.basename(argv[1]);
  var parser = new Parser([
      ':v(version)',
      'h(help)',
      'b:(base)',
      'c:(config)',
      'l:(listen)',
      'C:(control)',
      'N:(no-control)',
    ].join(''),
    argv);

  var base = '.strong-pm';
  var config;
  var listen;
  var control = 'pmctl';

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
      default:
        console.error('Invalid usage (near option \'%s\'), try `%s --help`.',
          option.optopt, $0);
        return callback(Error('usage'));
    }
  }

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

  stopWhenDone($0);

  // Only callback on error, on success, we listen until terminated
  return receive(listen, base)
    .on('error', function(er) {
      console.error('Listen on %s failed with: %s', listen, er.message);
      return callback(er);
    })
    .on('commit', function(commit) {
      debug('on commit:', commit);
      commit.config = configForCommit(config, commit);

      debug('on config:', commit.config);
      prepare(commit, function(err) {
        debug('on prepare:', err);
        if (err) {
          // XXX ... can I remove the commit?  not much else to do, would be nice
          // if git push could be failed, but I think its too late for that.
          return;
        }

        runner.run(commit);
      });
    })
    .on('listening', function() {
      console.log('%s: listen on %s, work base is `%s` with config `%s`',
                  $0, this.address().port, base, config);

      if (control) {
        debug('start ipcctl on `%s`', control);
        ipcControl = ipcctl.start({
          control: control,
          http: this,
          runner: runner,
          config: config,
          base: base,
        }).on('listening', function() {
          var address = this.address();

          if (address.port) {
            console.log('%s: control listening on port `%s`', $0, address.port);
          } else {
            console.log('%s: control listening on path `%s`', $0, address.path);
          }
        });
      }

      var currentSymlink = this.git.workdir({id: 'current'});
      var self = this;

      fs.readlink(currentSymlink, function(err, id) {
        if (err) return;

        var dir = self.git.workdir({id: id});
        var hash = id.split('.')[0];
        // XXX(sam) repo not passed? config won't be correct!
        var commit = cicadaCommit({hash: hash, id: id, dir: dir});
        commit.config = configForCommit(config, commit);
        runner.run(commit);
      });
    });
};

var ipcControl;

function stopWhenDone($0) {
  function stop() {
    if (ipcControl) {
      ipcControl.close();
      ipcControl = null;
    }
    runner.stop();
  }

  function dieBy(signal) {
    console.log('%s: stopped with %s', $0, signal);
    stop();

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
    stop();
  });
}
