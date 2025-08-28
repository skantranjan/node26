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

async function sendforApproval(cm_code) {
    try {
        // Step 1: Search sdp_contractors table for cm_code and get primary ID
        const contractorQuery = `
            SELECT id, cm_code, cm_description, company_name, signoff_status, periods, region_id, srm, signatory
            FROM sdp_contractors 
            WHERE cm_code = $1 AND is_active = true
        `;
        const contractorResult = await pool.query(contractorQuery, [cm_code]);
        
        if (contractorResult.rows.length === 0) {
            return {
                success: false,
                message: 'Contractor not found with the provided cm_code or contractor is inactive',
                data: null
            };
        }
        
        const contractorId = contractorResult.rows[0].id;
        const contractorData = contractorResult.rows[0];
        
        // Step 2: Search sdp_contractor_spocs table with contractor_id
        const spocsQuery = `
            SELECT user_id 
            FROM sdp_contractor_spocs 
            WHERE contractor_id = $1
        `;
        const spocsResult = await pool.query(spocsQuery, [contractorId]);
        
        let userIds = [];
        let usersResult = { rows: [] };
        
        if (spocsResult.rows.length > 0) {
            userIds = spocsResult.rows.map(row => row.user_id);
            
            // Step 3: Get email addresses from sdp_users table
            const usersQuery = `
                SELECT id, username, email, role, is_active 
                FROM sdp_users 
                WHERE id = ANY($1) AND is_active = true
            `;
            usersResult = await pool.query(usersQuery, [userIds]);
        }
        
        // Step 4: Update approval-related fields for all SKUs with this CM code
        const updateSkuQuery = `
            UPDATE sdp_skudetails 
            SET is_sendforapproval = true, 
                is_admin = false, 
                is_cmapproved = true 
            WHERE cm_code = $1 AND is_active = true
            RETURNING id, sku_code, sku_description, is_sendforapproval, is_admin, is_cmapproved
        `;
        const updateSkuResult = await pool.query(updateSkuQuery, [cm_code]);
        
        console.log(`✅ Updated ${updateSkuResult.rows.length} SKUs with approval status changes`);
        if (updateSkuResult.rows.length > 0) {
            console.log('📋 SKUs updated:', updateSkuResult.rows.map(sku => 
                `${sku.sku_code} - ${sku.sku_description} (send: ${sku.is_sendforapproval}, admin: ${sku.is_admin}, cm_approved: ${sku.is_cmapproved})`
            ));
        }
        
        // Step 5: Send emails to all users
        let emailResults = [];
        if (usersResult.rows.length > 0) {
            emailResults = await sendEmailsToUsers(usersResult.rows, contractorData);
        }
        
        return {
            success: true,
            message: 'Approval request processed successfully',
            data: {
                contractor: {
                    id: contractorId,
                    cm_code: contractorData.cm_code,
                    cm_description: contractorData.cm_description,
                    company_name: contractorData.company_name,
                    signoff_status: contractorData.signoff_status,
                    periods: contractorData.periods,
                    region_id: contractorData.region_id,
                    srm: contractorData.srm,
                    signatory: contractorData.signatory
                },
                spocs_count: spocsResult.rows.length,
                users: usersResult.rows,
                emails_sent: emailResults,
                skus_updated: {
                    count: updateSkuResult.rows.length,
                    skus: updateSkuResult.rows.map(sku => ({
                        id: sku.id,
                        sku_code: sku.sku_code,
                        sku_description: sku.sku_description,
                        is_sendforapproval: sku.is_sendforapproval,
                        is_admin: sku.is_admin,
                        is_cmapproved: sku.is_cmapproved
                    }))
                }
            }
        };
        
    } catch (error) {
        console.error('Error in sendforApproval:', error);
        return {
            success: false,
            message: 'Internal server error',
            error: error.message
        };
    }
}

/**
 * Send emails to all users
 * @param {Array} users - Array of user objects with email addresses
 * @param {Object} contractorData - Contractor information
 * @returns {Array} Array of email sending results
 */
async function sendEmailsToUsers(users, contractorData) {
    const emailResults = [];
    
    for (const user of users) {
        try {
            // Email content
            const mailOptions = {
                from: 'noreply@haleon.com', // You can change this
                to: user.email,
                subject: `Approval Request - ${contractorData.cm_code} - ${contractorData.cm_description}`,
                html: `
                    <h2>Approval Request Notification</h2>
                    <p>Hello ${user.username},</p>
                    <p>This is to notify you about an approval request for the following contractor:</p>
                    <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
                        <h3>Contractor Details:</h3>
                        <ul>
                            <li><strong>CM Code:</strong> ${contractorData.cm_code}</li>
                            <li><strong>Description:</strong> ${contractorData.cm_description}</li>
                            <li><strong>Company:</strong> ${contractorData.company_name || 'N/A'}</li>
                            <li><strong>Signoff Status:</strong> ${contractorData.signoff_status}</li>
                            <li><strong>Periods:</strong> ${contractorData.periods}</li>
                            <li><strong>SRM:</strong> ${contractorData.srm || 'N/A'}</li>
                            <li><strong>Signatory:</strong> ${contractorData.signatory || 'N/A'}</li>
                        </ul>
                    </div>
                    <p>Please review and take necessary action.</p>
                    <p>Best regards,<br>Sustainability API System</p>
                `
            };
            
            // Send email
            const info = await transporter.sendMail(mailOptions);
            
            emailResults.push({
                user_id: user.id,
                email: user.email,
                status: 'sent',
                message_id: info.messageId,
                timestamp: new Date().toISOString()
            });
            
            console.log(`✅ Email sent successfully to ${user.email}: ${info.messageId}`);
            
        } catch (error) {
            console.error(`❌ Failed to send email to ${user.email}:`, error.message);
            
            emailResults.push({
                user_id: user.id,
                email: user.email,
                status: 'failed',
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }
    
    return emailResults;
}

module.exports = {
    sendforApproval
};