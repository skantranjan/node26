const { getSignoffDetailsByCmAndPeriod, getAllAgreements } = require('../models/model.getSignoffDetailsByCmAndPeriod');
const pool = require('../config/db.config');

/**
 * Controller to get signoff details by cm_code and period from the new agreements table
 */
async function getSignoffDetailsByCmAndPeriodController(request, reply) {
  try {
    const { cm_code, period } = request.query;
    
    // If no parameters provided, return all data
    if (!cm_code && !period) {
      const allAgreements = await getAllAgreements();
      
      reply.code(200).send({ 
        success: true, 
        message: 'All agreements data retrieved',
        count: allAgreements.length,
        data: allAgreements.map(item => ({
          id: item.id,
          email: item.email,
          agreement_id: item.agreement_id,
          status: item.status,
          adobe_status: item.adobe_status,
          signed_pdf_url: item.signed_pdf_url,
          blob_uploaded_at: item.blob_uploaded_at,
          cm_code: item.cm_code,
          periods: item.periods,
          created_at: item.created_at,
          updated_at: item.updated_at
        }))
      });
      return;
    }
    
    if (!cm_code || cm_code.trim() === '') {
      console.log('Validation failed: CM code is missing or empty');
      return reply.code(400).send({ 
        success: false, 
        message: 'CM code is required' 
      });
    }

    if (!period || period.trim() === '') {
      console.log('Validation failed: Period is missing or empty');
      return reply.code(400).send({ 
        success: false, 
        message: 'Period is required' 
      });
    }

    console.log('Calling database with:', { cm_code, period });
    
    // Log the exact SQL query for debugging
    const debugQuery = `
      SELECT id, email, agreement_id, status, created_at, updated_at, adobe_status, signed_pdf_url, blob_uploaded_at, cm_code, periods
      FROM public.agreements 
      WHERE cm_code = '${cm_code}' AND periods = '${period}'
      ORDER BY id ASC
    `;
    console.log('Debug SQL Query:', debugQuery);
    
    const signoffDetails = await getSignoffDetailsByCmAndPeriod(cm_code, period);
    console.log('Database returned:', signoffDetails.length, 'records');
    console.log('Raw database results:', JSON.stringify(signoffDetails, null, 2));
    
    // If no data found, check what periods are available for this CM code
    if (signoffDetails.length === 0) {
      const availablePeriods = await pool.query(`
        SELECT DISTINCT periods FROM public.agreements 
        WHERE cm_code = $1 AND periods IS NOT NULL 
        ORDER BY periods
      `, [cm_code]);
      
      const availablePeriodsList = availablePeriods.rows.map(row => row.periods);
      
      reply.code(200).send({ 
        success: true, 
        cm_code: cm_code,
        period: period,
        count: 0,
        message: `No data found for cm_code: ${cm_code} and period: ${period}`,
        available_periods: availablePeriodsList.length > 0 ? availablePeriodsList : [],
        suggestion: availablePeriodsList.length > 0 ? `Try using one of these periods: ${availablePeriodsList.join(', ')}` : 'No periods available for this CM code',
        data: []
      });
      return;
    }
    
    reply.code(200).send({ 
      success: true, 
      cm_code: cm_code,
      period: period,
      count: signoffDetails.length,
      data: signoffDetails.map(item => ({
        id: item.id,
        email: item.email,
        agreement_id: item.agreement_id,
        status: item.status,
        adobe_status: item.adobe_status,
        signed_pdf_url: item.signed_pdf_url,
        blob_uploaded_at: item.blob_uploaded_at,
        cm_code: item.cm_code,
        periods: item.periods,
        created_at: item.created_at,
        updated_at: item.updated_at
      }))
    });
  } catch (error) {
    console.error('Error in getSignoffDetailsByCmAndPeriodController:', error);
    request.log.error(error);
    reply.code(500).send({ 
      success: false, 
      message: 'Failed to fetch signoff details by CM code and period', 
      error: error.message 
    });
  }
}

module.exports = { getSignoffDetailsByCmAndPeriodController }; 