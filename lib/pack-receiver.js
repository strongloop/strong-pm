var cicadaCommit = require('cicada/lib/commit');
var crypto = require('crypto');
var fs = require('fs');
var mkdirp = require('mkdirp');
var os = require('os');
var path = require('path');
var tar = require('tar');
var url = require('url');
var zlib = require('zlib');

function PackReceiver(_cicada){
  this.cicada = _cicada;
}

PackReceiver.prototype.sendError = function (res, err) {
  res.writeHead(400);
  res.end('An error occured while processing the application tarball: ' + err);
};

PackReceiver.prototype.processTarball = function (req, res, tarGzPath, hash) {
  var that = this;

  var parsedUrl = url.parse(req.url);
  var repo = 'default';
  if (parsedUrl.pathname && parsedUrl.pathname !== '') {
    repo = parsedUrl.pathname.slice(1) || 'default';
  }
  var id = hash + '.' + Date.now();
  var untarDir = this.cicada.workdir({
    'id': id,
    'repo': repo
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
    that.sendError(res, 'Invalid tgz file');
  });

  var untarStream = tarStream.pipe(untar);
  untarStream.on('error', function(err) {
    console.log('Unable to deploy: %s', err);
    that.sendError(res, 'Invalid tgz file');
  });

  untarStream.on('end', function() {
    var branch = 'npm-pack';
    var commit = cicadaCommit({
      'hash': hash,
      'id': id,
      'dir': untarDir,
      'repo': repo,
      'branch': branch
    });
    that.cicada.emit('commit', commit);
    res.writeHead(200);
    res.end('Application deployed\n');
  });
};

PackReceiver.prototype.getTarballHash = function (req, res, tarballPath) {
  var tarballStream = fs.createReadStream(tarballPath);
  var shasum = crypto.createHash('sha1');
  var that = this;

  tarballStream.on('error', function(err) {
    console.log('Unable to deploy: %s', err);
    that.sendError(res, 'Corrupt file');
  });

  tarballStream.on('data', function(d) {
    shasum.update(d);
  });

  tarballStream.on('end', function() {
    var tarballHash = shasum.digest('hex');
    that.processTarball(req, res, tarballPath, tarballHash);
  });
};

PackReceiver.prototype.handle = function (req, res) {
  var that = this;
  var tmpDirPath = path.join(os.tmpdir(), 'strong-pm', Date.now().toString());
  mkdirp(tmpDirPath, {}, function(err, made) {
    if (err) {
      console.log('Unable to create temporary dir: %s (%s)', made, err);
      this.sendError(res, 'Internal error');
      return;
    }
    var tarballPath = path.join(tmpDirPath, 'application.tgz');
    var writeStream = fs.createWriteStream(tarballPath);
    req.pipe(writeStream);
    req.on('end', function() {
      that.getTarballHash(req, res, tarballPath);
    });
    req.on('error', function(err) {
      that.sendError(req, res, err);
    });
  });
};

module.exports = function (cicada){
  var r = new PackReceiver(cicada);
  r.handle = r.handle.bind(r);
  return r;
};
