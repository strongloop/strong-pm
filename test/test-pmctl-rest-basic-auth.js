// Run pmctl tests against the API

// tell pm server to require auth (Basic method)
process.env.STRONGLOOP_PM_HTTP_AUTH = 'basic:testuser:testpassword';

// tell pm client to use credentials
process.env.TEST_STRONGLOOP_PM_HTTP_AUTH = 'testuser:testpassword';

require('./test-pmctl-local');
