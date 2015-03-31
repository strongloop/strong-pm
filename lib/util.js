'use strict';

var assert = require('assert');

exports.mandatory = function mandatory(value) {
  assert(value);
  return value;
};
