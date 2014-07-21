var assert = require('assert');
var async = require('async');
var debug = require('debug')('strong-pm:test');
var path = require('path');
var tmp = require('temporary');
var util = require('util');

require('shelljs/global');

console.log('working dir for %s is %s', process.argv[1], process.cwd());

var config = require('../lib/config');
var configForCommit = config.configForCommit;
var configDefaults = config.configDefaults;

// Check for node silently exiting with code 0 when tests have not passed.
var ok = false;

process.on('exit', function(code) {
  if (code === 0) {
    assert(ok);
  }
});

function expectError(er) {
  if(er) {
    return null;
  } else {
    return Error('expected error');
  }
}

function write(lines) {
  if (!lines) {
    return '';
  }

  var content = lines.join('\n');
  var file = new tmp.File();
  file.writeFileSync(content);
  return file.path;
}

function expectConfig(expect, config, commit) {
  console.log('--test:');
  var configFile = write(config);
  var ini = configForCommit(configFile, commit || {repo: 'REPO'});
  console.log('commit: %j\ninput: %j\noutput: %j\nexpect: %j',
    commit, config, ini, expect);
  if (expect) {
    expect = merge(configDefaults, expect);
    expect.configFile = configFile;
    assert.deepEqual(ini, expect);
  }
}

function merge(dst, src) {
  var dst = util._extend({}, dst);
  return util._extend(dst, src);
}

expectConfig();
expectConfig(
  {stop: ['SIGINT']},
  ['stop=SIGINT']);
expectConfig(
  {prepare: ['cmd']},
  ['prepare=cmd']);
expectConfig(
  {prepare: []},
  ['prepare=']);
expectConfig(
  {prepare: ['cmd1', 'cmd2']},
  ['prepare[]= cmd1','prepare[]=cmd2']);
expectConfig(
  {prepare: ['cmd'], stop: ['SIGKILL']},
  ['[some-name]', 'prepare=cmd', 'stop=SIGKILL'],
  {repo: 'some-name'});
expectConfig(
  {prepare: ['cmd']},
  [
    'prepare[]=to be replaced',
    '[main]',
    'prepare[]=cmd'
  ],
  {repo: 'main'});

expectConfig(
  {files: {'to/that': 'from/this', 'other': 'other', '.env': '.env'}},
  [
    '[files]',
    'to/that = from/this',
    'other',
    '.env=',
    '[a-repo.files]',
    'XX',
  ]);
expectConfig(
  {files: {'to/that': 'from/this', 'other': 'other', '.env': '.env'}},
  [
    '[files]',
    'XX',
    '[a-repo.files]',
    'to/that = from/this',
    'other',
    '.env=',
  ],
  {repo: 'a-repo'});
expectConfig(
  {replace: ['SIGHUP']}
);
expectConfig(
  {replace: ['SIGTERM']},
  ['replace=SIGTERM']);
expectConfig(
  {replace: []},
  ['replace=']);
expectConfig(
  {replace: ['no']},
  ['replace=no']);
expectConfig(
  {replace: ['-']},
  ['replace=-']);

ok = true;
console.log('PASS')
