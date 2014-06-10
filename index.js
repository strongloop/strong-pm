var Parser = require('posix-getopt').BasicParser;
var assert = require('assert');
var debug = require('debug')('strong-deploy');
var path = require('path');

var configForCommit = require('./lib/config').configForCommit;

function printHelp($0, prn) {
  prn('usage: %s [options]', $0);
  prn('');
  prn('Options:');
  prn('  -h,--help         Print this message and exit.');
  prn('  -v,--version      Print version and exit.');
  prn('  -b,--base BASE    Base directory to work in (default .strong-deploy).');
  prn('  -c,--config       Config file (default BASE/config).');
  prn('  -l,--listen PORT  Listen on PORT for git pushes (no default).');
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
    ].join(''),
    argv);

  var base = '.strong-deploy';
  var config;
  var listen;

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

  if (listen) {
    // Only callback on error, on success, we listen until terminated
    console.log('%s: listen on %s, work base is `%s` with config `%s`',
      $0, listen,  base, config);
    var readConfig = configForCommit.bind(null, config);
    return require('./lib/receive')(listen, base, readConfig)
      .on('error', function(er) {
        console.error('%s: listen failed with %s', $0, er.message);
        return callback(er);
      })
      .on('prepare', function(commit) {
        debug('prepared: %j', commit);

        require('./lib/run').run(commit);
      });
  }

  console.error('TBD');

  return callback(Error('TBD'));
};
