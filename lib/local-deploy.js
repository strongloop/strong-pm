var concat = require('concat-stream');
var configForCommit = require('./config').configForCommit;
var crypto = require('crypto');
var fs = require('fs');
var serverCommit = require('strong-fork-cicada/lib/commit');
var url = require('url');
var debug = require('debug')('strong-pm:local-deploy');

function LocalDeployer(_server) {
  this.server = _server;
}

LocalDeployer.prototype.sendError = function(res, err) {
  debug('error 400: %s', err);
  res.writeHead(400);
  res.end('Local deploy failed: ' + err);
};

LocalDeployer.prototype.processLocalDir = function(req, res, dirPath, hash) {
  var id = hash + '.' + Date.now();

  var parsedUrl = url.parse(req.url);
  var repo = 'default';
  if (parsedUrl.pathname && parsedUrl.pathname !== '') {
    repo = parsedUrl.pathname.slice(1) || 'default';
  }

  debug('processLocalDir: id=%s dir=%s repo=%s branch=%s',
        id, dirPath, repo, branch);

  var branch = 'local-directory';
  var commit = serverCommit({
    hash: hash, id: id, dir: dirPath, repo: repo, branch: branch
  });

  commit.config = configForCommit(commit);
  commit.env = this.server.env();
  commit.runInPlace = true;

  debug('comit: %j', commit);
  this.server.emit('prepared', commit);
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

module.exports = function(server) {
  var r = new LocalDeployer(server);
  r.handle = r.handle.bind(r);
  return r;
};
