var App = require('strong-runner').App;
var bl = require('bl');
var util = require('util');

// XXX(sam) commit needs to have toString set to Runnable.c2s

module.exports = exports = Container;

function Container(options) {
  if (!(this instanceof Container))
    return new Container(options);

  App.call(this, options);

  //this.restartCount = 0; // XXX(sam) move here from strong-runner.App?
  this._appLog = bl();
  this._logGcTimer = setInterval(
    this._gcLogs.bind(this),
    exports.LOG_GC_INTERVAL_MS
  );
  this._logGcTimer.unref();

  this.stdout.pipe(this._appLog, {end: false});
  this.stderr.pipe(this._appLog, {end: false});
}

util.inherits(Container, App);

// This is a soft limit that is only checked/enforced once per LOG_GC interval.
exports.MAX_LOG_RETENTION_BYTES = 1 * 1024 * 1024;
exports.LOG_GC_INTERVAL_MS = 30 * 1000;

Container.prototype._gcLogs = function() {
  var overflow = this._appLog.length - exports.MAX_LOG_RETENTION_BYTES;
  if (overflow > 0) {
    this._appLog.consume(overflow);
  }
};

Container.prototype.readableLogSnapshot = function() {
  return this._appLog.duplicate();
};

Container.prototype.flushLogs = function() {
  this._appLog.consume(this._appLog.length);
};
