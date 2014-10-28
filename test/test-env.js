var sandbox = require('./sandbox');
var test = require('tap').test;
var Environment = require('../lib/env');

test('Environment constructor works without a file', function(t) {
  var env = new Environment();
  t.type(env, Environment);
  t.end();
});

test('Environment constructor with file', function(t) {
  sandbox(function(SANDBOX) {
    var env = new Environment(SANDBOX.empty);
    var merged = env.merged(process.env);
    t.type(env, Environment);
    t.equal(env.path, SANDBOX.empty);
    t.equivalent(merged, process.env, 'empty merged with env == env');
    t.isNot(merged, process.env, 'merged is a new object');
    t.end();
  });
});

test('Persistence', function(t) {
  sandbox(function(SANDBOX) {
    var env = new Environment(SANDBOX.empty);
    env.set('FOO', 'bar');
    env.save();
    t.strictEqual(env.all()['FOO'], 'bar');
    var env2 = new Environment(SANDBOX.empty);
    t.strictEqual(env.all()['FOO'], env2.all()['FOO']);
    t.end();
  });
});
