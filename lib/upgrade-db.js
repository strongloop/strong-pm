// Copyright IBM Corp. 2015,2016. All Rights Reserved.
// Node module: strong-pm
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

var MeshServer = require('strong-mesh-models').meshServer;
var MeshServiceManager = require('strong-mesh-models').ServiceManager;
var SQLite3 = require('loopback-connector-sqlite3');
var async = require('async');
var debug = require('debug')('upgrade-db');
var fs = require('fs');
var path = require('path');

module.exports = tryUpgradeDb;

function tryUpgradeDb(baseDir, memoryDbPath, dryRun, callback) {
  var meshDbPath = path.join(baseDir, 'strong-mesh.db');
  fs.stat(meshDbPath, function(err) {
    debug('Ensuring %s doesn\'t exist', meshDbPath);
    if (!err) {
      debug('Error: %s exist', meshDbPath);
      return callback(new Error('Database ' + meshDbPath + ' already exists'));
    }

    upgradeDb(memoryDbPath, meshDbPath, function(err) {
      if (err) {
        debug('Upgrade failed Removing db: %s', meshDbPath);
        return fs.unlink(meshDbPath, function(uerr) {
          if (uerr) {
            debug('Unable to remove database', uerr);
          }
          callback(err);
        });
      }
      if (dryRun) {
        debug('Cleaning out %s (dry-run).', meshDbPath);
        return fs.unlink(meshDbPath, callback);
      } else {
        debug('Cleaning out %s.', memoryDbPath);
        return fs.unlink(memoryDbPath, callback);
      }
    });
  });
}

function upgradeDb(memoryDbPath, meshDbPath, callback) {
  var meshOptions = {
    db: {
      connector: SQLite3,
      file: meshDbPath,
    },
  };
  var meshApp = MeshServer(new MeshServiceManager(), null, meshOptions);

  try {
    var data = JSON.parse(fs.readFileSync(memoryDbPath, 'utf8'));
  } catch (err) {
    debug('Source database %s missing or invalid', memoryDbPath);
    return callback(err);
  }
  var models = Object.keys(data.ids);

  meshApp.dataSources.db.autoupdate(function(err) {
    if (err) return callback(err);

    async.each(models, function(modelName, callback) {
      var modelData = data.models[modelName];

      var ModelCtor = meshApp.dataSources.db.models[modelName];
      async.each(Object.keys(modelData), function(id, callback) {
        var data = JSON.parse(modelData[id]);
        var model = new ModelCtor(data);
        model.save(callback);
      }, callback);
    }, callback);
  });
};
