// Copyright IBM Corp. 2015,2016. All Rights Reserved.
// Node module: strong-pm
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

var auth = require('http-auth');
var crypto = require('crypto');
var fmt = require('util').format;

module.exports = makeAuthMiddleware;
module.exports.parse = parseAuth;

var authMethods = {
  basic: makeBasicAuth,
  digest: makeDigestAuth,
  none: makeNoAuth,
};

function makeAuthMiddleware(pmAuthStr) {
  var parts = parseAuth(pmAuthStr);
  return authMethods[parts.scheme](parts.user, parts.realm, parts.pass);
}

var AUTH_REGEXP = /^(basic|digest):(.+):(.+)$/;
function parseAuth(pmAuthStr) {
  var parts = AUTH_REGEXP.exec(pmAuthStr) ||
              AUTH_REGEXP.exec('basic:' + pmAuthStr);
  var result = {
    scheme: parts ? parts[1] : 'none',
    user: parts && parts[2],
    pass: parts && parts[3],
    realm: 'strong-pm',
  };
  result.normalized = fmt('%s:%s:%s', result.scheme, result.user, result.pass);
  return result;
}

function makeNoAuth() {
  return function noop(req, res, next) {
    next();
  };
}

function makeBasicAuth(user, realm, pass) {
  console.log('PM: enabling HTTP authentication (Basic)');
  var basicAuth = auth.basic({realm: realm}, checkCredentials);
  return auth.connect(basicAuth);

  function checkCredentials(maybeUser, maybePassword, cb) {
    cb(maybeUser === user && maybePassword === pass);
  }
}

function makeDigestAuth(user, realm, pass) {
  console.log('PM: enabling HTTP authentication (Digest)');
  var digest = md5(fmt('%s:%s:%s', user, realm, pass));
  var digestAuth = auth.digest({realm: realm}, checkDigest);
  return auth.connect(digestAuth);

  function checkDigest(maybeUser, cb) {
    cb(maybeUser === user ? digest : null);
  }
}

function md5(input) {
  var hash = crypto.createHash('md5');
  hash.update(input);
  return hash.digest('hex');
}
