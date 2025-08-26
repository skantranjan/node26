const { updateComponentDetailsController } = require('../controllers/controller.componentDetails');

module.exports = async function (fastify, options) {
  // POST /update-component-detail/:mapping_id
  // Updates or replaces component details with FormData support (New Enhanced API)
  fastify.post('/update-component-detail/:mapping_id', updateComponentDetailsController);
};
