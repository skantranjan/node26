const pool = require('../config/db.config');

/**
 * Fetch signoff details by cm_code from the new agreements table
 */
async function getSignoffDetailsByCm(cm_code) {
  const result = await pool.query(`
    SELECT id, email, agreement_id, status, created_at, updated_at, adobe_status, signed_pdf_url, blob_uploaded_at, cm_code, periods
    FROM public.agreements 
    WHERE cm_code = $1
    ORDER BY id ASC
  `, [cm_code]);
  return result.rows;
}

module.exports = { getSignoffDetailsByCm }; 