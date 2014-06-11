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
    'sl-run'
  ],
  stop: [
    'SIGTERM',
  ],
  // restart = 'SIGHUP',
};

function configForCommit(configFile, commit) {
  var globalConfig;
  try {
    globalConfig = ini.parse(fs.readFileSync(configFile, 'utf-8'));
  } catch(er) {
    console.warn('Failed to read config `%s`: %s', configFile, er);
  }

  var config = {};
  config = util._extend(config, DEFAULTS);
  config = util._extend(config, globalConfig);
  config = util._extend(config, config[commit.repo]);

  var clean = {};

  // array for consistency
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
  multi('start');
  multi('stop');

  // XXX(sam) is there any way to validate supported signals? I should
  // perhaps hard-code the acceptable ones... :-(

  return clean;
}
exports.configForCommit = configForCommit;
exports.configDefaults = DEFAULTS;
