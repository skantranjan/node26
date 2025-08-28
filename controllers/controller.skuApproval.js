const { updateSkuApproval, sendApprovalEmail } = require('../models/model.skuApproval');

/**
 * Controller to update SKU approval status
 */
async function updateSkuApprovalController(request, reply) {
  try {
    const { 
      sku_code, 
      cm_code, 
      is_approved, 
      comment,
      is_admin,
      is_cmapproved
    } = request.body;

    // Log the incoming data from UI
    console.log('=== SKU APPROVAL REQUEST DATA ===');
    console.log('SKU Code:', sku_code);
    console.log('CM Code:', cm_code);
    console.log('Is Approved:', is_approved);
    console.log('Comment:', comment || 'No comment provided');
    console.log('Is Admin:', is_admin);
    console.log('Is CM Approved:', is_cmapproved);
    console.log('=== END SKU APPROVAL REQUEST DATA ===');

    // Validate required fields
    if (!sku_code || sku_code.trim() === '') {
      return reply.code(400).send({ 
        success: false, 
        message: 'sku_code is required' 
      });
    }

    if (!cm_code || cm_code.trim() === '') {
      return reply.code(400).send({ 
        success: false, 
        message: 'cm_code is required' 
      });
    }

    if (is_approved === undefined || is_approved === null) {
      return reply.code(400).send({ 
        success: false, 
        message: 'is_approved is required' 
      });
    }

    // Update SKU approval status with additional fields
    const updatedSku = await updateSkuApproval(
      sku_code, 
      cm_code, 
      is_approved, 
      comment,
      is_admin,
      is_cmapproved
    );
    
    if (!updatedSku) {
      return reply.code(404).send({ 
        success: false, 
        message: 'SKU not found with the provided sku_code and cm_code' 
      });
    }

    // Send email notification to the user who created the SKU
    let emailResult = null;
    try {
      emailResult = await sendApprovalEmail(updatedSku);
      console.log('✅ Email notification sent successfully');
    } catch (emailError) {
      console.error('❌ Failed to send email notification:', emailError.message);
      // Don't fail the entire request if email fails
    }

    reply.code(200).send({ 
      success: true,
      message: 'SKU approval status updated successfully',
      data: updatedSku,
      email_sent: emailResult ? true : false,
      email_details: emailResult
    });

  } catch (error) {
    request.log.error(error);
    reply.code(500).send({ 
      success: false, 
      message: 'Failed to update SKU approval status', 
      error: error.message 
    });
  }
}

module.exports = {
  updateSkuApprovalController
};
