var cicadaCommit = require('strong-fork-cicada/lib/commit');
var crypto = require('crypto');
var fmt = require('util').format;
var fs = require('fs');
var mkdirp = require('mkdirp');
var os = require('os');
var path = require('path');
var tar = require('tar');
var url = require('url');
var zlib = require('zlib');

function PackReceiver(_cicada) {
  this.cicada = _cicada;
}

PackReceiver.prototype.sendError = function(res, err) {
  res.writeHead(400);
  res.end('An error occured while processing the application tarball: ' + err);
};

PackReceiver.prototype.processTarball = function(req, res, tarGzPath, hash) {
  var self = this;

  var id = hash + '.' + Date.now();
  var untarDir = this.cicada.workdir({
    'id': id
  });
  var tarGzStream = fs.createReadStream(tarGzPath);
  var untar = tar.Extract({
    'path': untarDir,
    'strip': 1
  });
  var ungzip = zlib.createGunzip();

  var tarStream = tarGzStream.pipe(ungzip);
  tarStream.on('error', function(err) {
    console.log('Unable to deploy: %s', err);
    self.sendError(res, 'Invalid tgz file');
  });

  var untarStream = tarStream.pipe(untar);
  untarStream.on('error', function(err) {
    console.log('Unable to deploy: %s', err);
    self.sendError(res, 'Invalid tgz file');
  });

  untarStream.on('end', function() {
    var parsedUrl = url.parse(req.url);
    var repo = 'default';
    if (parsedUrl.pathname && parsedUrl.pathname !== '') {
      repo = parsedUrl.pathname.slice(1) || 'default';
    }

    var branch = 'npm-pack';
    var commit = cicadaCommit({
      hash: hash,
      id: id,
      dir: untarDir,
      repo: repo,
      branch: branch
    });
    commit.runInPlace = false;
    self.cicada.emit('commit', commit);
    res.writeHead(200);
    res.end('Application deployed\n');
  });
};

PackReceiver.prototype.getTarballHash = function(req, res, tarballPath) {
  var tarballStream = fs.createReadStream(tarballPath);
  var shasum = crypto.createHash('sha1');
  var self = this;

  tarballStream.on('error', function(err) {
    console.log('Unable to deploy: %s', err);
    self.sendError(res, 'Corrupt file');
  });

  tarballStream.on('data', function(d) {
    shasum.update(d);
  });

  tarballStream.on('end', function() {
    var tarballHash = shasum.digest('hex');
    self.processTarball(req, res, tarballPath, tarballHash);
  });
};

PackReceiver.prototype.handle = function(req, res) {
  var self = this;
  var tmpDir = fmt('strong-pm-%d-%d', process.pid, Date.now());
  var tmpDirPath = path.join(os.tmpdir(), tmpDir);
  mkdirp(tmpDirPath, {}, function(err, made) {
    if (err) {
      console.log('Unable to create temporary dir: %s (%s)', made, err);
      self.sendError(res, 'Internal error');
      return;
    }
    var tarballPath = path.join(tmpDirPath, 'application.tgz');
    var writeStream = fs.createWriteStream(tarballPath);
    req.pipe(writeStream);
    req.on('end', function() {
      self.getTarballHash(req, res, tarballPath);
    });
    req.on('error', function(err) {
      self.sendError(req, res, err);
    });
  });
};

module.exports = function(cicada) {
  var r = new PackReceiver(cicada);
  r.handle = r.handle.bind(r);
  return r;
};
