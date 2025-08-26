const { generatepdf } = require('../controllers/controller.generatepdf');

async function generatepdfRoutes(fastify, options) {
  // POST endpoint that gets OAuth token and uploads file in one call
  fastify.post('/pdf-accesstoken', {
    schema: {
      consumes: ['multipart/form-data']
    },
    preHandler: async (request, reply) => {
      // Ensure multipart is properly configured
      if (!request.isMultipart()) {
        return reply.code(400).send({
          success: false,
          message: 'Request must be multipart/form-data',
          timestamp: new Date().toISOString()
        });
      }
    }
  }, generatepdf);
}

module.exports = generatepdfRoutes;
