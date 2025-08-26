const { getUserByEmail } = require('../models/model.getUser');

/**
 * Get user by email controller
 * POST /getuser
 * Body: { email: "user@example.com" }
 */
async function getUserController(request, reply) {
  try {
    const { email } = request.body;
    
    // Validate email input
    if (!email) {
      return reply.code(400).send({
        success: false,
        message: 'Email is required in request body'
      });
    }
    
    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return reply.code(400).send({
        success: false,
        message: 'Invalid email format'
      });
    }
    
    // Get user from database
    const user = await getUserByEmail(email);
    
    if (!user) {
      return reply.code(404).send({
        success: false,
        message: 'User not found with the provided email'
      });
    }
    
    // Return user data with contractor information (flattened)
    const responseData = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      is_active: user.is_active,
      created_at: user.created_at
    };

    // Add contractor fields directly to main data object if they exist
    if (user.user_id) {
      responseData.user_id = user.user_id;
      responseData.cm_code = user.cm_code;
      responseData.cm_description = user.cm_description;
      responseData.company_name = user.company_name;
      responseData.signoff_by = user.signoff_by;
      responseData.signoff_date = user.signoff_date;
      responseData.signoff_status = user.signoff_status;
      responseData.document_url = user.document_url;
      responseData.periods = user.periods;
      responseData.region_id = user.region_id;
      responseData.srm = user.srm;
      responseData.signatory = user.signatory;
      responseData.updated_at = user.contractor_updated_at;
    }

    return reply.code(200).send({
      success: true,
      message: 'User found successfully',
      data: responseData
    });
    
  } catch (error) {
    console.error('Error in getUserController:', error);
    
    return reply.code(500).send({
      success: false,
      message: 'Internal server error occurred while fetching user data'
    });
  }
}

module.exports = {
  getUserController
};
