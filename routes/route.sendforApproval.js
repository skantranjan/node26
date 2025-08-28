const { sendforApproval } = require('../controllers/controller.sendforApprovals');
const bearerTokenMiddleware = require('../middleware/middleware.bearer');

async function routes(fastify, options) {
    // Protected route - requires Bearer token
    fastify.post('/sendfor-approval', {
        preHandler: bearerTokenMiddleware
    }, async (request, reply) => {
        try {
            const { cm_code } = request.body;
            
            if (!cm_code) {
                return reply.status(400).send({
                    success: false,
                    message: 'cm_code is required'
                });
            }
            
            const result = await sendforApproval(cm_code);
            
            if (result.success) {
                return reply.status(200).send(result);
            } else {
                // Check if it's a "not found" case or other error
                if (result.message.includes('not found') || result.message.includes('Contractor not found')) {
                    return reply.status(404).send(result);
                } else {
                    return reply.status(500).send(result);
                }
            }
            
        } catch (error) {
            console.error('Route error:', error);
            return reply.status(500).send({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    });
}

module.exports = routes;