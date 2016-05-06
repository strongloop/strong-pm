// Copyright IBM Corp. 2015,2016. All Rights Reserved.
// Node module: strong-pm
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

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
var zlib = require('zlib');

function PackReceiver(_cicada) {
  this.cicada = _cicada;
}

PackReceiver.prototype.sendError = function(res/*, fmt, ...*/) {
  var args = [].slice.call(arguments, 1);
  var msg = fmt.apply(null, args);

  debug('send error: %s', msg);

  res.writeHead(400);
  res.end(msg);
};

PackReceiver.prototype.processTarball = function(req, res, tarGzPath, hash) {
  var self = this;

  var id = hash + '.' + Date.now();
  var untarDir = this.cicada.workdir({id: id});
  var tarOptions = {
    path: untarDir,
    strip: 1,
  };
  var readStream = fs.createReadStream(tarGzPath);
  var unzipStream = zlib.createGunzip();
  var untarStream = tar.Extract(tarOptions);

  debug('start untgz from %s', tarGzPath);
  debug('start untgz into %s', untarDir);

  // FIXME sequence below appears to not validate its input... wtf? repro by
  // using curl with --data instead of --data-binary... no errors occur. Or
  // sending a zero-byte file.

  readStream.pipe(unzipStream).pipe(untarStream);

  readStream.on('error', function(err) {
    self.sendError(res, 'Read %s failed with: %s', tarGzPath, err);
  });
  unzipStream.on('error', function(err) {
    self.sendError(res, 'Untar %s failed with: %s', tarGzPath, err);
  });
  untarStream.on('error', function(err) {
    self.sendError(res, 'Untar %s failed with: %s', tarGzPath, err);
  });

  untarStream.on('end', function() {
    debug('done untgz from %s', tarGzPath);
    debug('done untgz into %s', untarDir);

    // XXX(sam) I'm setting up a structure where I use my own folders
    // to distinguish between services... but perhaps I could find a way to
    // use repos? The last element of the git push path will be 'deploy',
    // but perhaps we can manually make the path be
    //   /api/Services/SVC/deploy/SVC
    // so that a single cicada instatnce takes care of tracking the 'repo'
    // rather than the Container needing a Cicada per service?
    var repo = 'default';

    var branch = 'npm-pack';
    var commit = cicadaCommit({
      hash: hash,
      id: id,
      dir: untarDir,
      repo: repo,
      branch: branch,
    });
    commit.runInPlace = false;
    self.cicada.emit('commit', commit);
    res.writeHead(200);
    res.end('Application received');
  });
};

PackReceiver.prototype.getTarballHash = function(req, res, tarballPath) {
  var tarballStream = fs.createReadStream(tarballPath);
  var shasum = crypto.createHash('sha1');
  var self = this;

  tarballStream.on('error', function(err) {
    console.log('Read %s for sha failed: %s', tarballPath, err);
    self.sendError(res, 'Read %s for sha failed: %s', tarballPath, err);
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
    var file = fs.createWriteStream(tarballPath);

    debug('write tar to %s', tarballPath);

    req.pipe(file);

    req.on('error', onError);
    file.on('error', onError);

    function onError(err) {
      self.sendError(res, err);
      rmrf(tmpDirPath, function(err) {
        debug('rmrf %j failed with: %s (ignoring)', tmpDirPath, err);
      });
    }

    file.on('finish', function() {
      if (debug.enabled) {
        var stat = fs.statSync(tarballPath);
        debug('write finish %s: %j bytes', tarballPath, stat.size);
      }
      self.getTarballHash(req, res, tarballPath);
    });
  });
};

module.exports = function(cicada) {
  var r = new PackReceiver(cicada);
  r.handle = r.handle.bind(r);
  return r;
};
