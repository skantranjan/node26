const pool = require('../config/db.config');

/**
 * Get component by ID from sdp_component_details table
 * @param {number} componentId - The component ID to retrieve
 * @returns {Promise<Object|null>} Component data if exists, null if not
 */
async function getComponentById(componentId) {
  try {
    const query = `
      SELECT cd.*, cm.id as mapping_id, cm.version, cm.component_packaging_type_id, 
             cm.period_id, cm.component_valid_from, cm.component_valid_to
      FROM sdp_component_details cd
      LEFT JOIN sdp_sku_component_mapping_details cm ON cd.component_code = cm.component_code
      WHERE cd.id = $1 AND cd.is_active = true
      ORDER BY cm.version DESC
      LIMIT 1
    `;
    const result = await pool.query(query, [componentId]);
    return result.rows[0] || null;
  } catch (error) {
    throw new Error(`Error getting component by ID: ${error.message}`);
  }
}

/**
 * Check if component_code exists in sdp_component_details table
 * @param {string} componentCode - The component code to check
 * @returns {Promise<Object|null>} Component data if exists, null if not
 */
async function checkComponentCodeExists(componentCode) {
  try {
    const query = 'SELECT id, component_code FROM sdp_component_details WHERE component_code = $1 AND is_active = true';
    const result = await pool.query(query, [componentCode]);
    return result.rows[0] || null;
  } catch (error) {
    throw new Error(`Error checking component code: ${error.message}`);
  }
}

/**
 * Check if component_description already exists in sdp_component_details table
 * @param {string} componentDescription - The component description to check
 * @returns {Promise<Object|null>} Component data if exists, null if not
 */
async function checkComponentDescriptionExists(componentDescription) {
  try {
    const query = 'SELECT id, component_code, component_description FROM sdp_component_details WHERE component_description = $1 AND is_active = true';
    const result = await pool.query(query, [componentDescription]);
    return result.rows[0] || null;
  } catch (error) {
    throw new Error(`Error checking component description: ${error.message}`);
  }
}

/**
 * Get current reporting period from sdp_period table
 * @returns {Promise<Object|null>} Current period data
 */
async function getCurrentReportingPeriod() {
  try {
    const query = `
      SELECT id, period, is_active
      FROM sdp_period 
      WHERE is_active = true 
      ORDER BY period DESC 
      LIMIT 1
    `;
    const result = await pool.query(query);
    return result.rows[0] || null;
  } catch (error) {
    throw new Error(`Error getting current reporting period: ${error.message}`);
  }
}

/**
 * Validate component validity dates against current reporting period
 * @param {Date} validFrom - Component valid from date
 * @param {Date} validTo - Component valid to date
 * @param {Object} currentPeriod - Current reporting period data
 * @returns {Promise<Object>} Validation result
 */
async function validateComponentValidityDates(validFrom, validTo, currentPeriod) {
  try {
    const validationResult = {
      isValid: true,
      errors: [],
      fieldErrors: {}
    };

    if (!currentPeriod) {
      validationResult.isValid = false;
      validationResult.errors.push('Current reporting period not found');
      return validationResult;
    }

    const currentPeriodDate = new Date(currentPeriod.period);
    const currentYear = currentPeriodDate.getFullYear();

    // Validate component_valid_from
    if (validFrom) {
      const validFromDate = new Date(validFrom);
      if (validFromDate.getFullYear() < currentYear) {
        validationResult.isValid = false;
        const errorMessage = `Valid from date cannot be in the past. Current period is ${currentYear}`;
        validationResult.errors.push(errorMessage);
        validationResult.fieldErrors.component_valid_from = {
          message: errorMessage,
          currentPeriod: currentYear,
          providedDate: validFromDate.getFullYear(),
          suggestion: `Use ${currentYear} or later`
        };
      }
    }

    // Validate component_valid_to
    if (validTo) {
      const validToDate = new Date(validTo);
      if (validToDate.getFullYear() <= currentYear) {
        validationResult.isValid = false;
        const errorMessage = `Valid to date must be in the future. Current period is ${currentYear}`;
        validationResult.errors.push(errorMessage);
        validationResult.fieldErrors.component_valid_to = {
          message: errorMessage,
          currentPeriod: currentYear,
          providedDate: validToDate.getFullYear(),
          suggestion: `Use ${currentYear + 1} or later`
        };
      }
    }

    // Validate date range
    if (validFrom && validTo) {
      const validFromDate = new Date(validFrom);
      const validToDate = new Date(validTo);
      
      if (validFromDate >= validToDate) {
        validationResult.isValid = false;
        const errorMessage = 'Valid from date must be before valid to date';
        validationResult.errors.push(errorMessage);
        validationResult.fieldErrors.dateRange = {
          message: errorMessage,
          validFrom: validFromDate.toISOString().split('T')[0],
          validTo: validToDate.toISOString().split('T')[0],
          suggestion: 'Ensure valid from date is earlier than valid to date'
        };
      }
    }

    return validationResult;
  } catch (error) {
    throw new Error(`Error validating component validity dates: ${error.message}`);
  }
}

/**
 * Update component detail in sdp_component_details table
 * @param {number} componentId - The component ID to update
 * @param {Object} updateData - The data to update
 * @returns {Promise<Object>} Updated component data
 */
async function updateComponentDetail(componentId, updateData) {
  try {
    // Remove fields that shouldn't be updated in sdp_component_details table
    // Based on actual table structure from database
    const { 
      id, 
      created_date, 
      created_by,
      mapping_id,           // Remove - it belongs to mapping table
      version,              // Remove - it belongs to mapping table
      component_packaging_type_id, // Remove - it belongs to mapping table
      period_id,            // Remove - it belongs to mapping table
      component_valid_from, // Remove - it belongs to mapping table
      component_valid_to,   // Remove - it belongs to mapping table
      ...fieldsToUpdate 
    } = updateData;
    
    // Add last_update_date
    fieldsToUpdate.last_update_date = new Date();
    
    const columns = Object.keys(fieldsToUpdate);
    const placeholders = columns.map((_, index) => `$${index + 2}`);
    const values = [componentId, ...Object.values(fieldsToUpdate)];
    
    const query = `
      UPDATE sdp_component_details 
      SET ${columns.map((col, index) => `${col} = $${index + 2}`).join(', ')}
      WHERE id = $1 
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      throw new Error('Component not found for update');
    }
    
    return result.rows[0];
  } catch (error) {
    throw new Error(`Error updating component detail: ${error.message}`);
  }
}

/**
 * Insert component detail into sdp_component_details table
 * @param {Object} componentData - The component data to insert
 * @returns {Promise<Object>} Inserted component data
 */
async function insertComponentDetail(componentData) {
  try {
    // Remove fields that shouldn't be inserted into sdp_component_details table
    // Based on actual table structure from database
    const { 
      id, 
      mapping_id,           // Remove - it belongs to mapping table
      version,              // Remove - it belongs to mapping table
      component_packaging_type_id, // Remove - it belongs to mapping table
      period_id,            // Remove - it belongs to mapping table
      component_valid_from, // Remove - it belongs to mapping table
      component_valid_to,   // Remove - it belongs to mapping table
      ...fieldsToInsert 
    } = componentData;
    
    // Add created_date if not present
    if (!fieldsToInsert.created_date) {
      fieldsToInsert.created_date = new Date();
    }
    
    // Add last_update_date if not present
    if (!fieldsToInsert.last_update_date) {
      fieldsToInsert.last_update_date = new Date();
    }
    
    const columns = Object.keys(fieldsToInsert);
    const placeholders = columns.map((_, index) => `$${index + 1}`);
    const values = Object.values(fieldsToInsert);
    
    const query = `INSERT INTO sdp_component_details (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`;
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      throw new Error('Failed to insert component detail');
    }
    
    return result.rows[0];
  } catch (error) {
    throw new Error(`Error inserting component detail: ${error.message}`);
  }
}

/**
 * Update component mapping in sdp_sku_component_mapping_details table
 * @param {number} mappingId - The mapping ID to update
 * @param {Object} mappingData - The mapping data to update
 * @returns {Promise<Object>} Updated mapping data
 */
async function updateComponentMapping(mappingId, mappingData) {
  try {
    // Remove fields that shouldn't be updated
    const { id, created_by, ...fieldsToUpdate } = mappingData;
    
    const columns = Object.keys(fieldsToUpdate);
    const placeholders = columns.map((_, index) => `$${index + 2}`);
    const values = [mappingId, ...Object.values(fieldsToUpdate)];
    
    const query = `
      UPDATE sdp_sku_component_mapping_details 
      SET ${columns.map((col, index) => `${col} = $${index + 2}`).join(', ')}
      WHERE id = $1 
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      throw new Error('Component mapping not found for update');
    }
    
    return result.rows[0];
  } catch (error) {
    throw new Error(`Error updating component mapping: ${error.message}`);
  }
}

/**
 * Insert component mapping into sdp_sku_component_mapping_details table
 * @param {Object} mappingData - The mapping data to insert
 * @returns {Promise<Object>} Inserted mapping data
 */
async function insertComponentMapping(mappingData) {
  try {
    // Remove fields that shouldn't be inserted
    const { id, ...fieldsToInsert } = mappingData;
    
    const columns = Object.keys(fieldsToInsert);
    const placeholders = columns.map((_, index) => `$${index + 1}`);
    const values = Object.values(fieldsToInsert);
    
    const query = `INSERT INTO sdp_sku_component_mapping_details (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`;
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      throw new Error('Failed to insert component mapping');
    }
    
    return result.rows[0];
  } catch (error) {
    throw new Error(`Error inserting component mapping: ${error.message}`);
  }
}

/**
 * Insert audit log into sdp_component_details_auditlog table
 * @param {Object} auditData - The audit data to insert
 * @returns {Promise<Object>} Inserted audit data
 */
async function insertComponentAuditLog(auditData) {
  try {
    // Map the audit data to the correct table columns
    const auditRecord = {
      component_id: auditData.component_id,
      sku_code: auditData.sku_code,
      component_code: auditData.component_code,
      component_description: auditData.component_description,
      component_quantity: auditData.component_quantity,
      component_base_quantity: auditData.component_base_quantity,
      component_unit_weight: auditData.component_unit_weight,
      percent_w_w: auditData.percent_w_w,
      percent_mechanical_pcr_content: auditData.percent_mechanical_pcr_content,
      percent_mechanical_pir_content: auditData.percent_mechanical_pir_content,
      percent_chemical_recycled_content: auditData.percent_chemical_recycled_content,
      percent_bio_sourced: auditData.percent_bio_sourced,
      component_valid_from: auditData.component_valid_from,
      component_valid_to: auditData.component_valid_to,
      is_active: auditData.is_active,
      cm_code: auditData.cm_code,
      year: auditData.year,
      periods: auditData.periods,
      created_by: auditData.created_by || '1',
      created_date: new Date(),
      last_update_date: new Date(),
      // Store audit action in helper_column for tracking
      helper_column: `UPDATE_ACTION: component_updated`
    };
    
    const columns = Object.keys(auditRecord);
    const placeholders = columns.map((_, index) => `$${index + 1}`);
    const values = Object.values(auditRecord);
    
    const query = `INSERT INTO sdp_component_details_auditlog (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`;
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      throw new Error('Failed to insert audit log');
    }
    
    return result.rows[0];
  } catch (error) {
    throw new Error(`Error inserting audit log: ${error.message}`);
  }
}

/**
 * Insert evidence file into sdp_evidence table
 * @param {Object} evidenceData - The evidence data to insert
 * @returns {Promise<Object>} Inserted evidence data
 */
async function insertEvidenceFile(evidenceData) {
  try {
    // Remove fields that shouldn't be inserted
    const { id, ...fieldsToInsert } = evidenceData;
    
    // Add created_date if not present
    if (!fieldsToInsert.created_date) {
      fieldsToInsert.created_date = new Date();
    }
    
    const columns = Object.keys(fieldsToInsert);
    const placeholders = columns.map((_, index) => `$${index + 1}`);
    const values = Object.values(fieldsToInsert);
    
    const query = `INSERT INTO sdp_evidence (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`;
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      throw new Error('Failed to insert evidence file');
    }
    
    return result.rows[0];
  } catch (error) {
    throw new Error(`Error inserting evidence file: ${error.message}`);
  }
}

/**
 * Get component evidence files from sdp_evidence table
 * @param {number} componentId - The component ID to get evidence for
 * @returns {Promise<Array>} Array of evidence files
 */
async function getComponentEvidenceFiles(componentId) {
  try {
    const query = `
      SELECT id, component_id, evidence_file_name, evidence_file_url, 
             created_by, created_date, category
      FROM sdp_evidence 
      WHERE component_id = $1 
      ORDER BY created_date DESC
    `;
    
    const result = await pool.query(query, [componentId]);
    return result.rows || [];
  } catch (error) {
    throw new Error(`Error getting component evidence files: ${error.message}`);
  }
}

/**
 * Delete evidence file from sdp_evidence table
 * @param {number} evidenceId - The evidence ID to delete
 * @returns {Promise<Object>} Deletion result
 */
async function deleteEvidenceFile(evidenceId) {
  try {
    const query = 'DELETE FROM sdp_evidence WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [evidenceId]);
    
    if (result.rows.length === 0) {
      throw new Error('Evidence file not found for deletion');
    }
    
    return result.rows[0];
  } catch (error) {
    throw new Error(`Error deleting evidence file: ${error.message}`);
  }
}

/**
 * Delete all component mappings for a specific component code
 */
async function deleteAllMappingsForCMAndSKU(componentCode, reason = 'REPLACED', user = 'system') {
  try {
    console.log(`🗑️ Deleting all mappings for component code: ${componentCode}`);
    
    const query = `
      DELETE FROM sdp_sku_component_mapping_details 
      WHERE component_code = $1
    `;
    
    const result = await pool.query(query, [componentCode]);
    
    console.log(`✅ Deleted ${result.rowCount} mappings for component code: ${componentCode}`);
    
    return {
      success: true,
      deletedCount: result.rowCount,
      componentCode: componentCode,
      reason: reason,
      deletedBy: user
    };
    
  } catch (error) {
    console.error('❌ Error deleting component mappings:', error.message);
    throw new Error(`Failed to delete component mappings: ${error.message}`);
  }
}

module.exports = {
  getComponentById,
  checkComponentCodeExists,
  checkComponentDescriptionExists,
  getCurrentReportingPeriod,
  validateComponentValidityDates,
  updateComponentDetail,
  insertComponentDetail,
  updateComponentMapping,
  insertComponentMapping,
  insertComponentAuditLog,
  insertEvidenceFile,
  getComponentEvidenceFiles,
  deleteEvidenceFile,
  deleteAllMappingsForCMAndSKU
};
