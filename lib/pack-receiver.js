var cicadaCommit = require('strong-fork-cicada/lib/commit');
var crypto = require('crypto');
var debug = require('debug')('strong-pm:pack-receiver');
var fmt = require('util').format;
var fs = require('fs');
var mkdirp = require('mkdirp');
var os = require('os');
var path = require('path');
var rmrf = require('rimraf');
var tar = require('tar');
var url = require('url');
var zlib = require('zlib');

function PackReceiver(_cicada) {
  this.cicada = _cicada;
}

PackReceiver.prototype.sendError = function(res, err) {
  debug('send error: %s', err);
  res.writeHead(400);
  res.end('Package deploy failed with: ' + err);
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
    self.sendError(res, 'Invalid tgz file (unzip failed with %s)', err);
  });

  var untarStream = tarStream.pipe(untar);
  untarStream.on('error', function(err) {
    console.log('Unable to deploy: %s', err);
    self.sendError(res, 'Invalid tgz file (untar failed with %s)', err);
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
    self.sendError(res, 'Corrupt file (read failed with %s)', err);
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
  debug('mkdirp %j', tmpDirPath);
  mkdirp(tmpDirPath, {}, function(err, made) {
    if (err) {
      self.sendError(res, fmt(
        'Unable to create dir: %s (%s)', made, err));
      return;
    }
    var tarballPath = path.join(tmpDirPath, 'application.tgz');
    debug('write tar to %s', tarballPath);
    var writeStream = fs.createWriteStream(tarballPath);

    req.pipe(writeStream);
    req.on('error', onError);
    writeStream.on('error', onError);

    function onError(err) {
      self.sendError(res, err);
      rmrf(tmpDirPath, function(err) {
        debug('rmrf %j failed with: %s (ignoring)', tmpDirPath, err);
      });
    }

    writeStream.on('finish', function() {
      debug('write finish %s', tarballPath);
      self.getTarballHash(req, res, tarballPath);
    });
  });
};

module.exports = function(cicada) {
  var r = new PackReceiver(cicada);
  r.handle = r.handle.bind(r);
  return r;
};
