var serviceInstance = require('../../models/service-instance');
var service = require('../../models/service');
var action = require('../../models/action');

module.exports = function(server) {
  service(server.models.Service);
  action(server.models.Action);
  serviceInstance(server.models.ServiceInstance);
}
