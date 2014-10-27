var pmctlChannel = require('strong-control-channel/server');
var processChannel = require('strong-control-channel/process');
var fs = require('fs');

exports.start = start;

function start(controlPath, requestListener) {
  // Always listen to our parent process
  var parent;

  if (process.send) {
    parent = processChannel.attach(requestListener);
  }

  // XXX(sam) I don't like this 'last one wins' approach, but its impossible to
  // prevent the channel outliving the server under all conditions, this is the
  // only robust way I've found.
  try {
    fs.unlinkSync(controlPath);
  } catch(er) {
    // Didn't exist
  }

  var server = pmctlChannel.create(requestListener).listen(controlPath);

  server.unref();

  server.on('error', function(er) {
    console.error('Control channel failed to listen on `%s`: %s',
      controlPath, er);
    throw er;
  });

  return { parent: parent, local: server };;
}
