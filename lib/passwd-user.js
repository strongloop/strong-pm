// Inspired by https://github.com/sindresorhus/passwd-user
'use strict';
var exec = require('child_process').exec;
var fs = require('fs');

function extractDarwin(line) {
  var cols = line.split(':');

  // Darwin passwd(5)
  // 0 name      User's login name.
  // 1 password  User's encrypted password.
  // 2 uid       User's id.
  // 3 gid       User's login group id.
  // 4 class     User's general classification (unused).
  // 5 change    Password change time.
  // 6 expire    Account expiration time.
  // 7 gecos     User's full name.
  // 8 home_dir  User's home directory.
  // 9 shell     User's login shell.

  return {
    username: cols[0],
    password: cols[1],
    uid: Number(cols[2]),
    gid: Number(cols[3]),
    comments: cols[7], // actually full name
    homedir: cols[8],
    shell: cols[9]
  };
}

function extractLinux(line) {
  var cols = line.split(':');

  // Linux passwd(5):
  // 0 login name
  // 1 optional encrypted password
  // 2 numerical user ID
  // 3 numerical group ID
  // 4 user name or comment field
  // 5 user home directory
  // 6 optional user command interpreter

  return {
    username: cols[0],
    password: cols[1],
    uid: Number(cols[2]),
    gid: Number(cols[3]),
    comments: cols[4] && cols[4].split(','), // comments or full name
    homedir: cols[5],
    shell: cols[6]
  };
}

var extracts = {
  linux: extractLinux,
  darwin: extractDarwin,
};

function getUser(str, username) {
  var lines = str.split('\n');
  var i = 0;
  var l = lines.length;
  var extract = extracts[process.platform];
  if (!extract) {
    return cb(new Error('Platform not supported'));
  }

  while (i < l) {
    var user = extract(lines[i++]);

    if (user.username === username || user.uid === Number(username)) {
      return user;
    }
  }
}

function fromPasswd(username, cb) {
  fs.readFile('/etc/passwd', 'utf8', function (err, passwd) {
    if (err) {
      return cb(err);
    }

    cb(null, getUser(passwd, username));
  });
}

function fromDarwinId(username, cb) {
  exec('id -P ' + username, function (err, passwd) {
    if (err) {
      return cb(err);
    }

    cb(null, getUser(passwd, username));
  });
}

module.exports = function (username, cb) {
  if (typeof username !== 'string' && typeof username !== 'number') {
    throw new TypeError('Expected a string or number');
  }
  if (process.platform === 'linux')
    return fromPasswd(username, cb);
  else if (process.platform === 'darwin')
    return fromDarwinId(username, cb);
  else
    throw new Error('Platform not supported');
};
