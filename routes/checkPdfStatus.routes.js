const { checkPdfStatus } = require('../controllers/controller.checkPdfStatus');

const checkPdfStatusRoutes = async (fastify, options) => {
  fastify.get('/check-pdf-status', {
    schema: {
      description: 'Check and update PDF agreement statuses from Adobe Sign',
      tags: ['PDF Status'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            data: {
              type: 'object',
              properties: {
                agreementsChecked: { type: 'number' },
                statusUpdates: { type: 'number' },
                filesDownloaded: { type: 'number' },
                results: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'number' },
                      email: { type: 'string' },
                      agreement_id: { type: 'string' },
                      oldStatus: { type: 'string' },
                      newStatus: { type: 'string' },
                                             adobeStatus: { type: 'string' },
                       updated: { type: 'boolean' },
                       fileDownloaded: { type: 'boolean' }
                    }
                  }
                }
              }
            },
            timestamp: { type: 'string' }
          }
        }
      }
    }
  }, checkPdfStatus);
};

module.exports = checkPdfStatusRoutes;
