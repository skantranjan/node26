const { getSignoffDetailsByCmAndPeriodController } = require('../controllers/controller.getSignoffDetailsByCmAndPeriod');
const { getAllAgreements } = require('../models/model.getSignoffDetailsByCmAndPeriod');
const bearerTokenMiddleware = require('../middleware/middleware.bearer');

async function getSignoffDetailsByCmAndPeriodRoutes(fastify, options) {
  // Protected route - requires Bearer token
  fastify.get('/signoff-details-by-cm-period', {
    preHandler: bearerTokenMiddleware
  }, getSignoffDetailsByCmAndPeriodController);

  // New route to get all agreements data
  fastify.get('/all-agreements', {
    preHandler: bearerTokenMiddleware
  }, async (request, reply) => {
    try {
      console.log('=== API CALL: getAllAgreements ===');
      const allAgreements = await getAllAgreements();
      console.log('Database returned:', allAgreements.length, 'records');
      
      reply.code(200).send({ 
        success: true, 
        message: 'All agreements data retrieved',
        count: allAgreements.length,
        data: allAgreements.map(item => ({
          id: item.id,
          email: item.email,
          agreement_id: item.agreement_id,
          status: item.status,
          adobe_status: item.adobe_status,
          signed_pdf_url: item.signed_pdf_url,
          blob_uploaded_at: item.blob_uploaded_at,
          cm_code: item.cm_code,
          periods: item.periods,
          created_at: item.created_at,
          updated_at: item.updated_at
        }))
      });
    } catch (error) {
      console.error('Error in getAllAgreements:', error);
      reply.code(500).send({ 
        success: false, 
        message: 'Failed to fetch all agreements data', 
        error: error.message 
      });
    }
  });
}

module.exports = getSignoffDetailsByCmAndPeriodRoutes; 