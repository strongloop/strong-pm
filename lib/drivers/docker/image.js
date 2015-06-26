'use strict';

var Container = require('./container');
var DeployReceiver = require('strong-deploy-receivers');
var EventEmitter = require('events').EventEmitter;
var debug = require('debug');
var fmt = require('util').format;
var inherits = require('util').inherits;
var sdb = require('strong-docker-build');

module.exports = exports = Image;

function Image(driver, svcDir) {
  EventEmitter.call(this);
  this.debug = debug('strong-pm:docker:image');
  this.driver = driver;
  this.docker = driver.docker;

  // TODO: extract the below to drivers/common and remove from here and direct
  // driver if possible.

  // XXX(sam) might be able to use a single cicada, made in the driver, and
  // using the repo set to the svcId, but this works fine.
  this._svcDir = svcDir;
  this.on('commit', this._onCommit.bind(this));
}

inherits(Image, EventEmitter);

Image.from = function(driver, svcDir, req, res) {
  var image = new Image(driver, svcDir);
  image.receive(req, res);
  return image;
};

Image.prototype.receive = function(req, res) {
  this.debug('Docker::Image.receive()');
  var contentType = req.headers['content-type'];

  this.debug('deploy request: locked? %s method %j content-type %j',
        !!process.env.STRONG_PM_LOCKED, req.method, contentType);

  if (process.env.STRONG_PM_LOCKED) {
    this.debug('deploy rejected: locked');
    return rejectDeployments(req, res);
  }

  var deployReceiver = new DeployReceiver({
    baseDir: this._svcDir,
    allowLocalDeploy: true,
  });
  deployReceiver.on('commit', this._onCommit.bind(this));
  deployReceiver.on('error', this.emit.bind(this, 'error'));
  return deployReceiver.handle(req, res);
};

function rejectDeployments(req, res) {
  res.status(403)
     .set('Content-Type', 'text/plain')
     .end('Forbidden: Server is not accepting deployments');
}

Image.prototype._onCommit = function(commit) {
  this.name = fmt('%s/svc:%s', 'strong-pm', commit.hash);
  var self = this;
  this.debug('Image committed', commit);
  this.commit = commit;
  var imgOpts = {
    appRoot: this.commit.dir,
    imgName: this.name,
    // XXX(rmg): build the image with a locally modified/unreleased supervisor
    //supervisor: require('path').dirname(require.resolve('strong-supervisor')),
  };
  this.docker.getImage(imgOpts.imgName).inspect(function(err, details) {
    if (!err && details) {
      return self.emit('image', {id: details.Id, name: imgOpts.imgName});
    }
    sdb.buildDeployImage(imgOpts, function(err, img) {
      self.image = img;
      if (err) {
        self.emit('error', err);
      } else {
        self.emit('image');
      }
    });
  });
};

Image.prototype._onPrepared = function(commit) {
  this.debug('Image prepared', commit);
};

Image.prototype.start = function(instance, logger, startOpts) {
  var container = new Container(this, instance, logger, startOpts);
  container.once('ready', function() {
    container.start();
  });
  return container;
};
