// Run pmctl tests against the API
process.env.STRONGLOOP_PM = 'x'; // Will be filled in with actual pm port/url
require('./test-pmctl-local');
