// Copyright IBM Corp. 2015. All Rights Reserved.
// Node module: strong-pm
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

var debug = require('debug');
var name = require('../package.json').name;
var MAX = 220;

function json(js) {
  // Don't json encode the string if debug is disabled.
  if (this.enabled) {
    var s = JSON.stringify(js);

    if (s.length < MAX)
      return s;

    return s.substring(0, MAX) + '...';
  }
  return '';
}

module.exports = function(tag) {
  var fn = debug(name + ':' + tag);
  fn.json = json;
  return fn;
};
