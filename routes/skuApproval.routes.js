const { updateSkuApprovalController } = require('../controllers/controller.skuApproval');
const bearerTokenMiddleware = require('../middleware/middleware.bearer');

async function skuApprovalRoutes(fastify, options) {
  // Protected route - requires Bearer token
  fastify.post('/skuapproval', {
    preHandler: bearerTokenMiddleware
  }, updateSkuApprovalController);
}

module.exports = skuApprovalRoutes;
