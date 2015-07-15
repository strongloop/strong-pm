'use strict';

var _ = require('lodash');
var debug = require('debug')('strong-pm:drivers:common');
var fmt = require('util').format;
var os = require('os');

exports.accept = acceptControlChannel;

function acceptControlChannel(server, wsRouter, handler) {
  var port = server.port();
  var client = wsRouter.acceptClient(handler);
  var token = client.getToken();
  var addr = publicIp();
  var wsPath = wsRouter.path;
  client.url = fmt('ws://%s@%s:%d%s', token, addr, port, wsPath);
  debug('accept container control: %s', client.url);
  return client;
}

// TODO: This should probably be configurable, but for now just grab the first
// non-internal IPv4 address we find
function publicIp() {
  return _(os.networkInterfaces())
          .omit(['docker0', 'docker1', 'docker2'])
          .values()
          .flatten()
          .where({family: 'IPv4', internal: false})
          .pluck('address')
          .first();
}
