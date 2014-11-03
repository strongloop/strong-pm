#!/usr/bin/env node

// Exit on loss of parent process, if it had established an ipc control channel.
// We do this ASAP because we don't want child processes to leak, outliving
// their parent. If the parent has not established an 'ipc' channel to us, this
// will be a no-op, the disconnect event will never occur.
process.on('disconnect', function() {
  process.exit(2);
});

require('../').main(process.argv, function(er) {
  if (!er) {
    process.exit(0);
  }
  process.exit(1);
});
