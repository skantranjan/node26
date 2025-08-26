const { pdfTransientDocument } = require('../controllers/controller.pdfTransientDocument');

async function pdfTransientDocumentRoutes(fastify, options) {
  // POST endpoint to upload file to Adobe Sign transient documents
  fastify.post('/pdf-transient-document', pdfTransientDocument);
}

module.exports = pdfTransientDocumentRoutes;
