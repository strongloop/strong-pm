var serviceInstance = require('../../models/service-instance');

module.exports = function(server) {
  serviceInstance(server.models.ServiceInstance);
}
