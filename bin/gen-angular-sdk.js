#!/usr/bin/env node

var fs = require('fs');
var generate = require('loopback-sdk-angular').services;
var Server = require('../lib/server');

var ngModuleName = 'pm-services';
var apiUrl = 'http://localhost:3000/api';

var server = new Server('', '', __dirname, 3000, null);
var content = generate(server._app, ngModuleName, apiUrl);

fs.writeFileSync(ngModuleName + '.js', content);
