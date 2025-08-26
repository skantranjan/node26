const pool = require('../config/db.config');
const { 
  getAllPmUsers, 
  getPmUserById, 
  updatePmUser, 
  deletePmUser 
} = require('../models/model.addpm');

/**
 * Add PM User Controller
 * Handles PM data with SRM and Spokes validation
 */
async function addPmController(request, reply) {
  try {
    const pmData = request.body;
    
    // Validate required fields
    if (!pmData.period || !pmData.srm_name || !pmData.srm_email || !pmData.region || !pmData.spokes || !pmData.cm_code || !pmData.cm_description) {
      return reply.code(400).send({
        success: false,
        message: 'All required fields are missing: period, srm_name, srm_email, region, spokes, cm_code, cm_description'
      });
    }
    
    // Validate email format for SRM
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(pmData.srm_email)) {
      return reply.code(400).send({
        success: false,
        message: 'Please provide a valid SRM email address'
      });
    }
    
    // Validate spokes array
    if (!Array.isArray(pmData.spokes) || pmData.spokes.length === 0) {
      return reply.code(400).send({
        success: false,
        message: 'Spokes array is required and must contain at least one spoke'
      });
    }
    
    // Validate each spoke
    for (let i = 0; i < pmData.spokes.length; i++) {
      const spoke = pmData.spokes[i];
      if (!spoke.name || !spoke.email) {
        return reply.code(400).send({
          success: false,
          message: `Spoke ${i + 1} is missing required fields: name and email`
        });
      }
      
      if (!emailRegex.test(spoke.email)) {
        return reply.code(400).send({
          success: false,
          message: `Spoke ${i + 1} has invalid email format`
        });
      }
    }
    
         const client = await pool.connect();
     
     try {
       // Start database transaction
       await client.query('BEGIN');
       console.log('🔄 Starting database transaction...');
       
       // 1. FIRST: Check if CM code already exists in sdp_contractors table
       console.log('🔍 Checking CM code in database...');
       const cmCheckQuery = `
         SELECT id, cm_code, cm_description
         FROM public.sdp_contractors 
         WHERE cm_code = $1
       `;
       
       const cmResult = await client.query(cmCheckQuery, [pmData.cm_code]);
       
       if (cmResult.rows.length > 0) {
         // CM code already exists - rollback and return 409 error
         await client.query('ROLLBACK');
         return reply.code(409).send({
           success: false,
           message: `CM Code "${pmData.cm_code}" already exists in the database. Please use a different CM code.`,
           error_type: 'cm_code_exists',
           existing_cm: {
             id: cmResult.rows[0].id,
             cm_code: cmResult.rows[0].cm_code,
             cm_description: cmResult.rows[0].cm_description
           }
         });
       }
       
       // 2. Check if SRM email exists in table
       console.log('🔍 Checking SRM email in database...');
       const srmCheckQuery = `
         SELECT id, username, email, role, is_active, created_at
         FROM public.sdp_users 
         WHERE email = $1
       `;
       
       const srmResult = await client.query(srmCheckQuery, [pmData.srm_email]);
       let srmUserId = null;
       let srmAction = '';
       
       if (srmResult.rows.length > 0) {
         // SRM already exists
         srmUserId = srmResult.rows[0].id;
         srmAction = 'existing';
         console.log(`✅ SRM already exists with ID: ${srmUserId}`);
       } else {
         // Create new SRM entry
         const insertSrmQuery = `
           INSERT INTO public.sdp_users (username, email, role, is_active, created_at)
           VALUES ($1, $2, $3, $4, NOW())
           RETURNING id, username, email, role, is_active, created_at
         `;
         
                   const insertSrmValues = [
            pmData.srm_name,
            pmData.srm_email,
            2,  // role: 2 for SRM
            true
          ];
         
         const insertSrmResult = await client.query(insertSrmQuery, insertSrmValues);
         srmUserId = insertSrmResult.rows[0].id;
         srmAction = 'created';
         console.log(`✅ SRM created with ID: ${srmUserId}`);
       }
      
             // 2. Check each spoke email in table - NEW VALIDATION LOGIC
       console.log('🔍 Checking spoke emails in database...');
       const existingSpokes = [];
       
       // First, check ALL spokes to see if any already exist
       for (let i = 0; i < pmData.spokes.length; i++) {
         const spoke = pmData.spokes[i];
         
         const spokeCheckQuery = `
           SELECT id, username, email, role, is_active, created_at
           FROM public.sdp_users 
           WHERE email = $1
         `;
         
         const spokeResult = await client.query(spokeCheckQuery, [spoke.email]);
         
         if (spokeResult.rows.length > 0) {
           // Spoke already exists - add to existing list
           existingSpokes.push({
             name: spoke.name,
             email: spoke.email,
             signatory: spoke.signatory,
             existing_id: spokeResult.rows[0].id,
             message: `Spoke "${spoke.name}" (${spoke.email}) already exists in database`
           });
           console.log(`⚠️  Spoke "${spoke.name}" (${spoke.email}) already exists with ID: ${spokeResult.rows[0].id}`);
         } else {
           console.log(`✅ Spoke "${spoke.name}" (${spoke.email}) is new`);
         }
       }
       
               // If ANY spoke already exists, rollback and return error
        if (existingSpokes.length > 0) {
          const existingSpokeNames = existingSpokes.map(spoke => `${spoke.name} (${spoke.email})`).join(', ');
          
          // Rollback transaction
          await client.query('ROLLBACK');
          
                     return reply.code(422).send({
             success: false,
             message: `Cannot save PM data. The following SPOCs already exist in the database: ${existingSpokeNames}. Please remove these SPOCs before proceeding.`,
             error_type: 'spocs_exist',
             existing_spokes: existingSpokes,
             total_existing: existingSpokes.length,
             total_requested: pmData.spokes.length,
             detailed_message: `SPOCs already exist: ${existingSpokeNames}. Please check your spoke data and try again.`
           });
        }
       
               // 3. Create entries for ALL spokes since none exist
        const createdSpokes = [];
        let signatoryUserId = null;
        
        for (const spoke of pmData.spokes) {
          const insertSpokeQuery = `
            INSERT INTO public.sdp_users (username, email, role, is_active, created_at)
            VALUES ($1, $2, $3, $4, NOW())
            RETURNING id, username, email, role, is_active, created_at
          `;
          
                     const insertSpokeValues = [
             spoke.name,
             spoke.email,
             3,  // role: 3 for SPOC
             true
           ];
          
          const insertSpokeResult = await client.query(insertSpokeQuery, insertSpokeValues);
          const spokeUserId = insertSpokeResult.rows[0].id;
          
          createdSpokes.push({
            ...spoke,
            id: spokeUserId,
            message: `Spoke "${spoke.name}" (${spoke.email}) created successfully`
          });
          console.log(`✅ Spoke "${spoke.name}" created with ID: ${spokeUserId}`);
          
          // Track the signatory user ID
          if (spoke.signatory) {
            signatoryUserId = spokeUserId;
          }
        }
        
        // 4. Insert data into sdp_contractors table with blank/default values
        console.log('📝 Inserting data into sdp_contractors table with blank values...');
        const insertContractorQuery = `
          INSERT INTO public.sdp_contractors (
            cm_code, cm_description, created_at, updated_at, company_name, 
            signoff_by, signoff_date, document_url, periods, 
            is_active, region_id, srm, signatory
          ) VALUES ($1, $2, NOW(), NOW(), $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING id, cm_code, cm_description, created_at
        `;
        
        const insertContractorValues = [
          pmData.cm_code,                    // cm_code
          pmData.cm_description,             // cm_description
          null,                              // company_name (blank)
          null,                              // signoff_by (blank)
          null,                              // signoff_date (blank)
          null,                              // document_url (blank)
          pmData.period,                     // periods
          true,                              // is_active
          pmData.region_id || 1,            // region_id (default to 1 if not provided)
          srmUserId,                         // srm (SRM user ID)
          signatoryUserId                    // signatory (SPOC user ID who is signatory)
        ];
        
                 const insertContractorResult = await client.query(insertContractorQuery, insertContractorValues);
         const contractorId = insertContractorResult.rows[0].id;
         console.log(`✅ Contractor record created with ID: ${contractorId}`);
         
         // 5. Insert SPOC relationships into sdp_contractor_spocs table
         console.log('📝 Inserting SPOC relationships into sdp_contractor_spocs table...');
         const createdSpocRelationships = [];
         
         for (const spoke of createdSpokes) {
           const insertSpocRelationshipQuery = `
             INSERT INTO public.sdp_contractor_spocs (contractor_id, user_id)
             VALUES ($1, $2)
             RETURNING contractor_id, user_id
           `;
           
           const insertSpocRelationshipValues = [
             contractorId,  // contractor_id
             spoke.id       // user_id (SPOC's user ID)
           ];
           
           const insertSpocRelationshipResult = await client.query(insertSpocRelationshipQuery, insertSpocRelationshipValues);
           
           createdSpocRelationships.push({
             contractor_id: contractorId,
             user_id: spoke.id,
             spoc_name: spoke.name,
             spoc_email: spoke.email,
             message: `SPOC relationship created for "${spoke.name}" (${spoke.email})`
           });
           
           console.log(`✅ SPOC relationship created: Contractor ${contractorId} - SPOC ${spoke.id} (${spoke.name})`);
         }
         
         // Commit transaction
         await client.query('COMMIT');
         console.log('✅ Database transaction committed successfully');
      
      // Console log the results
      console.log('=' .repeat(60));
      console.log('📋 ADDPM API - PROCESSING RESULTS');
      console.log('=' .repeat(60));
             console.log('📅 Period:', pmData.period);
       console.log('👤 SRM Name:', pmData.srm_name);
       console.log('📧 SRM Email:', pmData.srm_email);
       console.log('🌍 Region:', pmData.region);
      console.log('');
      console.log('👤 SRM Status:', srmAction === 'existing' ? 'Already Exists' : 'Created New');
      console.log('🆔 SRM User ID:', srmUserId);
      console.log('');
      console.log('🔄 SPOKES PROCESSING:');
      console.log(`✅ All Spokes (${pmData.spokes.length}) created successfully:`);
      pmData.spokes.forEach((spoke, index) => {
        console.log(`  ${index + 1}. ${spoke.name} (${spoke.email}) - Signatory: ${spoke.signatory ? 'Yes' : 'No'}`);
      });
      console.log('=' .repeat(60));
      
             // Prepare summary messages for UI
       const summaryMessages = [];
       
       // SRM message
       if (srmAction === 'created') {
         summaryMessages.push(`SRM "${pmData.srm_name}" (${pmData.srm_email}) created successfully`);
       } else {
         summaryMessages.push(`SRM "${pmData.srm_name}" (${pmData.srm_email}) already exists in database`);
       }
       
       // Spokes messages
       summaryMessages.push(`${pmData.spokes.length} spokes created successfully`);
       
               // Return success response
        return reply.code(200).send({
          success: true,
          message: 'PM data processed successfully',
          summary: summaryMessages.join('. '),
          data: {
            period: pmData.period,
            srm_name: pmData.srm_name,
            srm_email: pmData.srm_email,
            srm_user_id: srmUserId,
            srm_action: srmAction,
            srm_message: srmAction === 'created' 
              ? `SRM "${pmData.srm_name}" (${pmData.srm_email}) created successfully`
              : `SRM "${pmData.srm_name}" (${pmData.srm_email}) already exists in database`,
            cm_code: pmData.cm_code,
            cm_description: pmData.cm_description,
            region: pmData.region,
            total_spokes: pmData.spokes.length,
            created_spokes: createdSpokes,
                         contractor_data: {
               id: contractorId,
               cm_code: pmData.cm_code,
               cm_description: pmData.cm_description,
               srm_user_id: srmUserId,
               signatory_user_id: signatoryUserId,
               period: pmData.period,
               signoff_status: 'pending'
             },
             spoc_relationships: createdSpocRelationships,
             processing_summary: {
               srm_status: srmAction,
               spokes_created: createdSpokes.length,
               contractor_created: true,
               spoc_relationships_created: createdSpocRelationships.length,
               total_processed: pmData.spokes.length
             },
            processed_at: new Date().toISOString()
          }
        });
      
         } catch (dbError) {
       // Rollback transaction on any database error
       try {
         await client.query('ROLLBACK');
         console.log('❌ Database transaction rolled back due to error');
       } catch (rollbackError) {
         console.error('Error during rollback:', rollbackError);
       }
       throw dbError;
     } finally {
       client.release();
     }
    
  } catch (error) {
    console.error('Error in addPmController:', error);
    return reply.code(500).send({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
}

/**
 * Get All PM Users Controller
 */
async function getAllPmUsersController(request, reply) {
  try {
    const result = await getAllPmUsers();
    
    if (result.success) {
      return reply.code(200).send(result);
    } else {
      return reply.code(500).send(result);
    }
    
  } catch (error) {
    console.error('Error in getAllPmUsersController:', error);
    return reply.code(500).send({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
}

/**
 * Get PM User by ID Controller
 */
async function getPmUserByIdController(request, reply) {
  try {
    const userId = request.params.id;
    
    if (!userId || isNaN(userId)) {
      return reply.code(400).send({
        success: false,
        message: 'Valid user ID is required'
      });
    }
    
    const result = await getPmUserById(userId);
    
    if (result.success) {
      return reply.code(200).send(result);
    } else {
      return reply.code(404).send(result);
    }
    
  } catch (error) {
    console.error('Error in getPmUserByIdController:', error);
    return reply.code(500).send({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
}

/**
 * Update PM User Controller
 */
async function updatePmUserController(request, reply) {
  try {
    const userId = request.params.id;
    const userData = request.body;
    
    if (!userId || isNaN(userId)) {
      return reply.code(400).send({
        success: false,
        message: 'Valid user ID is required'
      });
    }
    
    // Validate email format if email is being updated
    if (userData.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(userData.email)) {
        return reply.code(400).send({
          success: false,
          message: 'Please provide a valid email address'
        });
      }
    }
    
    const result = await updatePmUser(userId, userData);
    
    if (result.success) {
      return reply.code(200).send(result);
    } else {
      if (result.message.includes('not found')) {
        return reply.code(404).send(result);
      } else if (result.message.includes('already exists')) {
        return reply.code(409).send(result);
      }
      return reply.code(500).send(result);
    }
    
  } catch (error) {
    console.error('Error in updatePmUserController:', error);
    return reply.code(500).send({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
}

/**
 * Delete PM User Controller
 */
async function deletePmUserController(request, reply) {
  try {
    const userId = request.params.id;
    
    if (!userId || isNaN(userId)) {
      return reply.code(400).send({
        success: false,
        message: 'Valid user ID is required'
      });
    }
    
    const result = await deletePmUser(userId);
    
    if (result.success) {
      return reply.code(200).send(result);
    } else {
      return reply.code(404).send(result);
    }
    
  } catch (error) {
    console.error('Error in deletePmUserController:', error);
    return reply.code(500).send({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
}

module.exports = {
  addPmController,
  getAllPmUsersController,
  getPmUserByIdController,
  updatePmUserController,
  deletePmUserController
}; 