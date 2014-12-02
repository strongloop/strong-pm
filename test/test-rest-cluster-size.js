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
    'http://127.0.0.1:%s/api/ServiceInstances/1',
    addr.port
  );

  request({
    method: 'PUT',
    uri: url,
    body: {
      'cpus': 4,
      'setSize': 21
    },
    json: true
  }, function(err, res) {
    assert.ifError(err);
    assert(res.statusCode === 200);
    assert.deepEqual(runConfig.configDefaults['start'], ['sl-run --cluster=4']);

    server._app.models.ServiceInstance.findOne(function(err, inst) {
      assert.ifError(err);
      assert.equal(inst.setSize, 0);

      app.ok = true;
      server.stop();
      app.stop();
    })
  });
});
