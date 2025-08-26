const { updateComponentController } = require('../controllers/controller.updateComponent');
const bearerTokenMiddleware = require('../middleware/middleware.bearer');

async function updateComponentRoutes(fastify, options) {
  // Protected route - requires Bearer token
  fastify.put('/component-details/:id', {
    preHandler: bearerTokenMiddleware
  }, updateComponentController);
}

module.exports = updateComponentRoutes;
