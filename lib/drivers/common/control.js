// Copyright IBM Corp. 2015. All Rights Reserved.
// Node module: strong-pm
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

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
  var addr = publicIp(server);
  var wsPath = wsRouter.path;
  client.url = fmt('ws://%s@%s:%d%s', token, addr, port, wsPath);
  debug('accept container control: %s', client.url);
  return client;
}

// TODO: This should probably be configurable, but for now just grab the first
// non-internal IPv4 address we find
//
// On a machine with no networking, there is no external address. Returning
// `undefined` as the hostname goes badly, throwing an error just kills the
// server, so soldier on with a localhost IPv4 address, which works fine on a
// laptop with no wireless.
function publicIp(server) {
  if (/direct/.test(server.getDriverInfo().type)) {
    return '127.0.0.1';
  }
  return _(os.networkInterfaces())
          .omit(['docker0', 'docker1', 'docker2'])
          .values()
          .flatten()
          .where({family: 'IPv4', internal: false})
          .pluck('address')
          .first()
          || '127.0.0.1';
}
