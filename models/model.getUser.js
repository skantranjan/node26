const pool = require('../config/db.config');

/**
 * Get user by email with contractor data
 * @param {string} email - The email address to search for
 * @returns {Promise<Object|null>} User object with contractor data or null if not found
 */
async function getUserByEmail(email) {
  try {
    const query = `
      SELECT 
        u.id, 
        u.username, 
        u.email, 
        u.role, 
        u.is_active, 
        u.created_at,
        c.user_id,
        c.cm_code,
        c.cm_description,
        c.company_name,
        c.signoff_by,
        c.signoff_date,
        c.signoff_status,
        c.document_url,
        c.periods,
        c.region_id,
        c.srm,
        c.signatory,
        c.updated_at as contractor_updated_at
      FROM public.sdp_users u
      LEFT JOIN public.sdp_contractors c ON u.id = c.user_id
      WHERE u.email = $1
    `;
    
    const result = await pool.query(query, [email]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    // If user has multiple contractor records, return the first one
    // You can modify this logic based on your requirements
    return result.rows[0];
  } catch (error) {
    console.error('Error in getUserByEmail:', error);
    throw error;
  }
}

/**
 * Get all users
 * @returns {Promise<Array>} Array of all users
 */
async function getAllUsers() {
  try {
    const query = `
      SELECT id, username, email, role, is_active, created_at
      FROM public.sdp_users
      ORDER BY created_at DESC
    `;
    
    const result = await pool.query(query);
    return result.rows;
  } catch (error) {
    console.error('Error in getAllUsers:', error);
    throw error;
  }
}

module.exports = {
  getUserByEmail,
  getAllUsers
};
