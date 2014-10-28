var fs = require('fs');
var mkdirp = require('mkdirp');
var path = require('path');
var rimraf = require('rimraf');
var invocations = 0;

module.exports = withSandbox;

function withSandbox(testFn) {
  var id = invocations++;
  var SANDBOX = path.resolve(__dirname, 'SANDBOX' + id);
  var emptyFile = path.resolve(SANDBOX, 'empty.json');
  var emptyJSON = JSON.stringify({});
  var blankFile = path.resolve(SANDBOX, 'blank.json');
  var blankJSON = '';
  var missingFile = path.resolve(SANDBOX, 'missing.json');
  rimraf(SANDBOX, function(e) {
    mkdirp(SANDBOX, function (e) {
      fs.writeFile(emptyFile, emptyJSON, 'utf8', function(e) {
        fs.writeFile(blankFile, blankJSON, 'utf8', function(e) {
          var sandbox = {
            root: SANDBOX,
            empty: emptyFile,
            blank: blankFile,
            missing: missingFile,
          };
          testFn(sandbox);
        });
      });
    });
  });
}
