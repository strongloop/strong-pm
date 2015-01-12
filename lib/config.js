// Find config for a specific commit. Re-reading the config on every push allows
// any changes to be picked up immediately, and absence of a config isn't
// necessarily an error.

var fs = require('fs');
var ini = require('ini');
var util = require('util');

var DEFAULTS = {
  prepare: [
    'npm rebuild',
    'npm install --production',
  ],
  start: [
    'sl-run --cluster=' + ('STRONGLOOP_CLUSTER' in process.env ?
      process.env.STRONGLOOP_CLUSTER : 'CPU')
  ],
  stop: [
    'SIGTERM',
  ],
  replace: [
    'SIGHUP',
  ],
  files: {},
};

function configForCommit(configFile, commit) {
  var globalConfig;
  try {
    if (configFile && configFile.length > 0) {
      globalConfig = ini.parse(fs.readFileSync(configFile, 'utf-8'));
    }
  } catch(er) {
    if (er.code !== 'ENOENT')
      console.warn('Failed to read config `%s`: %j', configFile, er);
  }

  var config = {};
  config = util._extend(config, DEFAULTS);
  config = util._extend(config, globalConfig);
  config = util._extend(config, config[commit.repo]);

  var clean = {};

  function multi(name) {
    clean[name] = config[name];

    if (util.isArray(clean[name])) {
      return;
    }

    clean[name] = String(clean[name]);

    if (clean[name] === '') {
      clean[name] = [];
      return;
    }

    clean[name] = [ clean[name] ];
  }
  multi('prepare');

  // single-valued start/stop use array for consistency
  multi('start');
  multi('replace');
  multi('stop');

  function files(name) {
    // Map of files from source name to destination, support this ini syntax:
    //   [files]      ; a section of config entries
    //   dst = src    ; fully specified
    //   dst =        ; src is same as dst, ini will give value of ''
    //   dst          ; src is same as dst, ini will give value of true
    // Invalid configuration is discarded.
    var map = config[name];

    if (!map || typeof map !== 'object') {
      clean[name] = {};
      return;
    }

    Object.keys(map).forEach(function(dst) {
      if (map[dst] === true) {
        map[dst] = dst;
        return;
      }

      if (typeof map[dst] !== 'string') {
        delete map[dst];
        return;
      }

      map[dst] = map[dst].trim();

      if (map[dst] === '')
        map[dst] = dst;
    });

    clean[name] = map;
  }

  files('files');

  clean.configFile = configFile;

  return clean;
}
exports.configForCommit = configForCommit;
exports.configDefaults = DEFAULTS;
