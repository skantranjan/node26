const { getUserController } = require('../controllers/controller.getUser');
const bearerTokenMiddleware = require('../middleware/middleware.bearer');

async function getUserRoutes(fastify, options) {
  // Protected route - requires Bearer token
  fastify.post('/getuser', {
    preHandler: bearerTokenMiddleware
  }, getUserController);
}

module.exports = getUserRoutes;
