const { getComponentCodeDataController, getComponentCodeDataByCodeController } = require('../controllers/controller.getComponentCodeData');
const bearerTokenMiddleware = require('../middleware/middleware.bearer');

async function getComponentCodeDataRoutes(fastify, options) {
  // Test endpoint without authentication
  fastify.get('/test-component-code-data', async (request, reply) => {
    return { 
      success: true, 
      message: 'Route is working! This is a test endpoint for component-code-data API.',
      timestamp: new Date().toISOString()
    };
  });

  // GET endpoint as documented: /get-component-code-data?component_code=${componentCode}
  fastify.get('/get-component-code-data', {
    preHandler: bearerTokenMiddleware
  }, getComponentCodeDataByCodeController);

  // Protected route - requires Bearer token (changed from GET to POST)
  fastify.post('/component-code-data', {
    preHandler: bearerTokenMiddleware
  }, getComponentCodeDataController);

  // Unprotected route for testing (temporarily)
  fastify.post('/component-code-data-test', async (request, reply) => {
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

module.exports = getComponentCodeDataRoutes; 