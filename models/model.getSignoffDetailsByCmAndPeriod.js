const pool = require('../config/db.config');

/**
 * Fetch signoff details by cm_code and period from the new agreements table
 */
async function getSignoffDetailsByCmAndPeriod(cm_code, period) {
  const result = await pool.query(`
    SELECT id, email, agreement_id, status, created_at, updated_at, adobe_status, signed_pdf_url, blob_uploaded_at, cm_code, periods
    FROM public.agreements 
    WHERE cm_code = $1 AND periods = $2
    ORDER BY id ASC
  `, [cm_code, period]);
  return result.rows;
}

/**
 * Fetch all agreements data from the agreements table
 */
async function getAllAgreements() {
  const result = await pool.query(`
    SELECT id, email, agreement_id, status, created_at, updated_at, adobe_status, signed_pdf_url, blob_uploaded_at, cm_code, periods
    FROM public.agreements 
    ORDER BY id ASC
  `);
  return result.rows;
}

module.exports = { getSignoffDetailsByCmAndPeriod, getAllAgreements }; 