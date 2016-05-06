// Copyright IBM Corp. 2015. All Rights Reserved.
// Node module: strong-pm
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

var bl = require('bl');

module.exports = exports = makeLogBuffer;

// This is a soft limit that is only checked/enforced once per LOG_GC interval.
exports.MAX_LOG_RETENTION_BYTES = 1 * 1024 * 1024;
exports.LOG_GC_INTERVAL_MS = 30 * 1000;

function makeLogBuffer() {
  var logger = bl();

  logger.enableGC = function() {
    logger._logGcTimer = logger._logGcTimer || makeGcTimer();
  };

  logger.dump = function() {
    var logDump = logger.duplicate().toString();
    logger.consume(logDump.length);
    return logDump;
  };

  logger.on('end', function() {
    if (logger._logGcTimer) {
      clearInterval(logger.logGcTimer);
      logger._logGcTimer = null;
    }
  });

  return logger;

  function gcLogger() {
    var overflow = logger.length - exports.MAX_LOG_RETENTION_BYTES;
    if (overflow > 0) {
      logger.consume(overflow);
    }
  }

  function makeGcTimer() {
    var timer = setInterval(gcLogger, exports.LOG_GC_INTERVAL_MS);
    timer.unref();
    return timer;
  }
}
