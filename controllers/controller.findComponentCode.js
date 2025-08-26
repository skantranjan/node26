const { findComponentCode } = require('../models/model.findComponentCode');

/**
 * Controller to find component details by CM code and component code using two-table approach
 */
async function findComponentCodeController(request, reply) {
  try {
    const { cm_code, component_code } = request.body;
    
    // Validation
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
    
    const componentDetails = await findComponentCode(cm_code, component_code);
    
    // Always return success with data (empty array if no results found)
    reply.code(200).send({ 
      success: true, 
      count: componentDetails.length,
      cm_code: cm_code,
      component_code: component_code,
      message: componentDetails.length > 0 
        ? `Found ${componentDetails.length} SKU(s) for CM: ${cm_code} and Component: ${component_code}`
        : `No SKUs found for CM: ${cm_code} and Component: ${component_code}`,
      data: componentDetails,
      mapping_info: {
        total_mappings: componentDetails.length,
        unique_skus: [...new Set(componentDetails.map(item => item.sku_code))].length
      }
    });
    
  } catch (error) {
    request.log.error('Error in findComponentCodeController:', error);
    reply.code(500).send({ 
      success: false, 
      message: 'Failed to fetch component details by CM and component code', 
      error: error.message,
      cm_code: request.body?.cm_code,
      component_code: request.body?.component_code
    });
  }
}

module.exports = {
  findComponentCodeController
};
