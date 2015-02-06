var assert = require('assert');

var config = require('../lib/config');
var configForCommit = config.configForCommit;
var configDefaults = config.configDefaults;
var expected = JSON.parse(JSON.stringify(config.configDefaults));
expected.configFile = 'CONFIGFILE.ignored';
assert.deepEqual(configForCommit('CONFIGFILE'), expected);
