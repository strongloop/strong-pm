#!/usr/bin/env node
// Copyright IBM Corp. 2014,2015. All Rights Reserved.
// Node module: strong-pm
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

require('../lib/install')(process.argv, function(err) {
  process.exit(err ? 1 : 0);
});
