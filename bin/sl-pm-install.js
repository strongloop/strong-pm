#!/usr/bin/env node

require('../lib/install')(process.argv, function(err) {
  process.exit(err ? 1 : 0);
});
