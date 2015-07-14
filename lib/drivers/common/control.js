'use strict';

var _ = require('lodash');
var debug = require('debug')('strong-pm:drivers:common');
var fmt = require('util').format;
var os = require('os');

exports.create = createControlChannel;

function createControlChannel(server, wsRouter, handler) {
  var port = server.port();
  var channel = wsRouter.acceptClient(handler);
  var token = channel.getToken();
  var addr = publicIp();
  var wsPath = wsRouter.path;
  channel.url = fmt('ws://%s@%s:%d%s', token, addr, port, wsPath);
  debug('container control socket: %s', channel.url);
  return channel;
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
