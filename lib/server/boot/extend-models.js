var serviceInstance = require('../../models/service-instance');
var service = require('../../models/service');

module.exports = function(server) {
  serviceInstance(server.models.ServiceInstance);
  service(server.models.Service);
}

