// Copyright IBM Corp. 2015,2016. All Rights Reserved.
// Node module: strong-pm
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

var concat = require('concat-stream');
var crypto = require('crypto');
var debug = require('debug')('strong-pm:local-deploy');
var fs = require('fs');
var path = require('path');
var serverCommit = require('strong-fork-cicada/lib/commit');

module.exports = function(server) {
  var r = new LocalDeployer(server);
  r.handle = r.handle.bind(r);
  return r;
};

function LocalDeployer(_server) {
  // XXX(sam) we don't need server anymore, we could take a callback
  this.server = _server;
}

LocalDeployer.prototype.sendError = function(res, err) {
  debug('error 400: %s', err);
  res.writeHead(400);
  res.end('Local deploy failed: ' + err);
};

LocalDeployer.prototype.processLocalDir = function(req, res, dirPath, hash) {
  var id = hash + '.' + Date.now();

  var repo = path.basename(dirPath);

  debug('processLocalDir: id=%s dir=%s repo=%s branch=%s',
        id, dirPath, repo, branch);

  var branch = 'local-directory';

  var commit = serverCommit({
    hash: hash, id: id, dir: dirPath, repo: repo, branch: branch,
  });

  commit.runInPlace = true;

  debug('commit: %j', commit);
  this.server.emit('prepared', commit); // FIXME emit on container
  res.writeHead(200);
  res.end('Application deployed\n');
};

LocalDeployer.prototype.computeHash = function(req, res, dirPath) {
  var shasum = crypto.createHash('sha1');
  var self = this;

  shasum.update(dirPath);
  fs.stat(dirPath, function(err, stats) {
    if (err) {
      return self.sendError(res, '`' + dirPath + '` does not exist');
    }
    if (!stats.isDirectory()) {
      return self.sendError(res, '`' + dirPath + '` is not a directory');
    }

    var hash = shasum.digest('hex');
    self.processLocalDir(req, res, dirPath, hash);
  });
};

LocalDeployer.prototype.handle = function(req, res) {
  var self = this;

  req.pipe(concat(function(postData) {
    debug('%s', postData);
    try {
      var postObj = JSON.parse(postData);
      if (!postObj.hasOwnProperty('local-directory')) {
        return self.sendError(res, 'local directory not specified');
      }

      self.computeHash(req, res, postObj['local-directory']);
    } catch (err) {
      return self.sendError(res, 'error parsing request: ' + err.message);
    }
  }));

  req.on('error', function(err) {
    self.sendError(req, res, err);
  });
};
