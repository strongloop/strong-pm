var DEFAULTS = {
  prepare: [
    'npm rebuild',
    'npm install --production',
  ],
  start: [
    'sl-run --cluster=' + ('STRONGLOOP_CLUSTER' in process.env ?
      process.env.STRONGLOOP_CLUSTER : 'CPU')
  ],
  stop: [
    'SIGTERM',
  ],
  replace: [
    'SIGHUP',
  ],
  files: {},
};

function configForCommit(configFile /*, repo*/) {
  var clean = JSON.parse(JSON.stringify(DEFAULTS));
  clean.configFile = configFile + '.ignored';
  return clean;
}
exports.configForCommit = configForCommit;
exports.configDefaults = DEFAULTS;
