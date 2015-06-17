'use strict';

var _ = require('lodash');
var debug = require('debug')('strong-pm:drivers:common');
var fmt = require('util').format;
var os = require('os');

exports.create = createControlChannel;

function createControlChannel(server, wsRouter, handler) {
  var port = server.port();
  var channel = wsRouter.createChannel(handler);
  var token = channel.getToken();
  var addr = publicIp();
  var wsPath = wsRouter.path;
  channel.url = fmt('ws://%s@%s:%d%s', token, addr, port, wsPath);
  debug('container control socket: %s', channel.url);
  return channel;
}

// TODO:
// This is a simple stand-in to get things going. Realistically, we'll need to
// provide some way for the user to configure what host should be given out for
// use in URLs back to us, since we could be behind a proxy or load balancer or
// any number of odd network layers.
function publicIp() {
  var eths = os.networkInterfaces();
  var addrs = eths.en0 || eths.eth0;
  return _(addrs).where({family: 'IPv4'}).pluck('address').first();
}
