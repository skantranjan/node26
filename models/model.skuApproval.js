const pool = require('../config/db.config');
const nodemailer = require('nodemailer');

// Email configuration for corporate network
const emailConfig = {
    host: 'smtp.haleon.net',
    port: 25,
    secure: false, // false for port 25
    tls: {
        rejectUnauthorized: false
    }
};

// Create email transporter
const transporter = nodemailer.createTransport(emailConfig);

/**
 * Update SKU approval status by sku_code and cm_code
 * @param {string} sku_code - The SKU code
 * @param {string} cm_code - The CM code
 * @param {number} is_approved - The approval status (0, 1, 2, etc.)
 * @returns {Promise<Object>} The updated record
 */
async function updateSkuApproval(sku_code, cm_code, is_approved) {
  try {
    // First check if SKU exists with the given sku_code and cm_code
    const checkQuery = `
      SELECT id, sku_code, sku_description, cm_code, is_approved
      FROM public.sdp_skudetails 
      WHERE sku_code = $1 AND cm_code = $2 AND is_active = true
    `;
    
    const checkResult = await pool.query(checkQuery, [sku_code, cm_code]);
    
    if (checkResult.rows.length === 0) {
      console.log('❌ SKU not found:', { sku_code, cm_code });
      return null;
    }

    console.log('✅ SKU found, updating approval status...');
    console.log('Current approval status:', checkResult.rows[0].is_approved);
    console.log('New approval status:', is_approved);

    // Update the is_approved field
    const updateQuery = `
      UPDATE public.sdp_skudetails 
      SET is_approved = $3
      WHERE sku_code = $1 AND cm_code = $2 AND is_active = true
      RETURNING id, sku_code, sku_description, cm_code, cm_description, 
                sku_reference, is_active, created_by, created_date, period, 
                purchased_quantity, sku_reference_check, formulation_reference, 
                dual_source_sku, site, skutype, bulk_expert, is_copied, is_approved
    `;
    
    const updateResult = await pool.query(updateQuery, [sku_code, cm_code, is_approved]);
    
    if (updateResult.rows.length === 0) {
      console.log('❌ Failed to update SKU approval status');
      return null;
    }

    console.log('✅ SKU approval status updated successfully');
    console.log('Updated record:', updateResult.rows[0]);

    return updateResult.rows[0];

  } catch (error) {
    console.error('❌ Error updating SKU approval status:', error);
    throw error;
  }
}

/**
 * Send approval status email to the user who created the SKU
 * @param {Object} skuData - The updated SKU data
 * @returns {Promise<Object>} Email sending result
 */
async function sendApprovalEmail(skuData) {
  try {
    console.log('📧 === SENDING APPROVAL EMAIL ===');
    console.log('SKU Data:', JSON.stringify(skuData, null, 2));
    
    // Get user email from sdp_users table using created_by
    const userQuery = `
      SELECT id, username, email, role, is_active 
      FROM sdp_users 
      WHERE id = $1 AND is_active = true
    `;
    
    const userResult = await pool.query(userQuery, [skuData.created_by]);
    
    if (userResult.rows.length === 0) {
      console.log('❌ User not found for created_by:', skuData.created_by);
      return {
        success: false,
        message: 'User not found',
        error: 'User not found with the provided created_by ID'
      };
    }
    
    const user = userResult.rows[0];
    console.log('✅ User found:', user.username, user.email);
    
    // Determine approval status text
    let approvalStatus = 'Unknown';
    let statusColor = '#666666';
    
    switch (skuData.is_approved) {
      case 0:
        approvalStatus = 'Not Approved';
        statusColor = '#dc3545';
        break;
      case 1:
        approvalStatus = 'Approved';
        statusColor = '#28a745';
        break;
      case 2:
        approvalStatus = 'Pending Review';
        statusColor = '#ffc107';
        break;
      default:
        approvalStatus = `Status ${skuData.is_approved}`;
        statusColor = '#6c757d';
    }
    
    // Email content
    const mailOptions = {
      from: 'noreply@haleon.com',
      to: user.email,
      subject: `SKU Approval Status Update - ${skuData.sku_code}`,
      html: `
        <h2>SKU Approval Status Update</h2>
        <p>Hello ${user.username},</p>
        <p>Your SKU approval status has been updated:</p>
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${statusColor};">
          <h3 style="color: ${statusColor}; margin-top: 0;">SKU Details:</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #dee2e6;"><strong>SKU Code:</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #dee2e6;">${skuData.sku_code}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #dee2e6;"><strong>Description:</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #dee2e6;">${skuData.sku_description || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #dee2e6;"><strong>CM Code:</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #dee2e6;">${skuData.cm_code || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #dee2e6;"><strong>New Status:</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #dee2e6; color: ${statusColor}; font-weight: bold;">${approvalStatus}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #dee2e6;"><strong>Updated Date:</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #dee2e6;">${new Date().toLocaleDateString()}</td>
            </tr>
          </table>
        </div>
        <p>Please review the updated status and take any necessary actions.</p>
        <p>Best regards,<br>Sustainability API System</p>
      `
    };
    
    // Send email
    const info = await transporter.sendMail(mailOptions);
    
    console.log('✅ Email sent successfully to', user.email);
    console.log('Message ID:', info.messageId);
    
    return {
      success: true,
      message: 'Email sent successfully',
      user_id: user.id,
      username: user.username,
      email: user.email,
      message_id: info.messageId,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('❌ Error sending approval email:', error);
    return {
      success: false,
      message: 'Failed to send email',
      error: error.message
    };
  }
}

module.exports = {
  updateSkuApproval,
  sendApprovalEmail
};
