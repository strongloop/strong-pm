// Copyright IBM Corp. 2014,2015. All Rights Reserved.
// Node module: strong-pm
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

var fs = require('fs');
var path = require('path');

module.exports = Environment;

// XXX: This could trivially be extracted to a separate module
function Environment(file) {
  if (!(this instanceof Environment))
    return new Environment(file);

  this.path = file && path.resolve(file);
  try {
    this.raw = this.path && fs.readFileSync(this.path);
  } catch (e) {
    this.raw = '';
  }
  try {
    this.env = this.raw ? JSON.parse(this.raw) : Object.create(null);
  } catch (e) {
    this.env = Object.create(null);
  }
}

Environment.prototype.merged = function merged(env) {
  var result = JSON.parse(JSON.stringify(env));
  for (var key in this.env) {
    result[key] = this.env[key].toString();
  }
  return result;
};

Environment.prototype.save = function save(cb) {
  this.raw = JSON.stringify(this.env);
  if (cb)
    return fs.writeFile(this.path, this.raw, cb);
  else
    return fs.writeFileSync(this.path, this.raw);
};

Environment.prototype.set = function set(name, value) {
  this.env[name] = value;
};

Environment.prototype.all = function all() {
  return JSON.parse(JSON.stringify(this.env));
};

Environment.prototype.unset = function unset(name) {
  delete this.env[name];
};

Environment.prototype.apply = function apply(newEnv) {
  for (var k in newEnv) {
    if (newEnv[k] === null) {
      this.unset(k);
    } else {
      this.set(k, newEnv[k]);
    }
  }
};
