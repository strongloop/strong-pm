// Helpers to build deploy req,res object pairs

'use strict';

var debug = require('debug')('strong-pm:test');
var http = require('http');
var concat = require('concat-stream');

exports.local = local;

function local(path, callback) {
  debug('create local for %j', path);

  var contentType = 'application/x-pm-deploy';
  var data = JSON.stringify({
    'local-directory': path,
  });
  var server = http.createServer();
  var api = '/api/Services/1/deploy';
  var client;

  server.on('request', function(req, res) {
    debug('server: on request');
    server.close();
    callback(req, res, client);
  });

  // XXX(sam) server is INET6 by default, but client is INET4, wtf?

  server.listen(0, '127.0.0.1', function() {
    debug('server: listening on %j', this.address());

    request(this.address().port, this.address().address);
  });

  function request(port, host) {
    var options = {
      host: host,
      port: port,
      method: 'POST',
      path: api,
      headers: {
        'Content-Type': contentType,
        'Content-Length': data.length,
      },
    };

    debug('client: make request: %j', options);

    client = http.request(options);

    client.on('error', function(err) {
      debug('client: err %j', err);
    });

    client.on('response', function(rsp) {
      debug('client: got response');

      rsp.pipe(concat(function(data) {
        server.emit('response', String(data));
      }));
    });

    client.write('');
    client.write(data);
    client.end();
  }

  return server;
}
