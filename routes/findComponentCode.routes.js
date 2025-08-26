const { findComponentCodeController } = require('../controllers/controller.findComponentCode');
const bearerTokenMiddleware = require('../middleware/middleware.bearer');

async function findComponentCodeRoutes(fastify, options) {
  // Test endpoint without authentication
  fastify.get('/test-findcomponentcode', async (request, reply) => {
    return { 
      success: true, 
      message: 'Route is working! This is a test endpoint for findComponentCode API.',
      timestamp: new Date().toISOString()
    };
  });

  // Protected route - requires Bearer token
  fastify.post('/findcomponentcode', {
    preHandler: bearerTokenMiddleware
  }, findComponentCodeController);

  // Unprotected route for testing (temporarily)
  fastify.post('/findcomponentcode-test', async (request, reply) => {
    try {
      const { cm_code, component_code } = request.body;
      
      if (!cm_code || cm_code.trim() === '') {
        return reply.code(400).send({ 
          success: false, 
          message: 'cm_code is required' 
        });
      }
      
      if (!component_code || component_code.trim() === '') {
        return reply.code(400).send({ 
          success: false, 
          message: 'component_code is required' 
        });
      }

      return {
        success: true,
        message: 'Test endpoint working!',
        received_data: { cm_code, component_code },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return reply.code(500).send({
        success: false,
        message: 'Test endpoint error',
        error: error.message
      });
    }
  });
}

module.exports = findComponentCodeRoutes;
