// Copyright IBM Corp. 2015. All Rights Reserved.
// Node module: strong-pm
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

// Run pmctl tests against the API

// tell pm server to require auth (Basic method)
process.env.STRONGLOOP_PM_HTTP_AUTH = 'basic:testuser:testpassword';

// tell pm client to use credentials
process.env.TEST_STRONGLOOP_PM_HTTP_AUTH = 'testuser:testpassword';

require('./test-pmctl-local');
