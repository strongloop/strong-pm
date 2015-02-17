var app = require('./helper');
var assert = require('assert');
var debug = require('debug')('strong-pm:test');
var runConfig = require('../lib/config');
var request = require('request');
var util = require('util');

var server = app.listen();
server.once('listening', function(addr) {
  assert.deepEqual(runConfig.configDefaults['start'], ['sl-run --cluster=CPU']);

  var url = util.format(
    'http://127.0.0.1:%s/api/Services/1',
    addr.port
  );

  request({
    method: 'PUT',
    uri: url,
    body: {
      _groups: [{id: 1, cpus: 4, name: 'bar'}],
      name: 'foo'
    },
    json: true
  }, function(err, res) {
    assert.ifError(err);
    assert(res.statusCode === 200);
    assert.deepEqual(runConfig.configDefaults['start'], ['sl-run --cluster=4']);

    server._app.models.Service.findOne(function(err, s) {
      assert.ifError(err);
      assert.equal(s.name, 'default', 'Server name should not change');
      assert.equal(s._groups[0].name, 'default', 'Groupname should not change');
      assert.equal(s._groups[0].cpus, 4, 'CPUs should change');

      app.ok = true;
      server.stop();
      app.stop();
    })
  });
});
