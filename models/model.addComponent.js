const pool = require('../config/db.config');

/**
 * Check if component_code exists in sdp_component_details table
 * @param {string} componentCode - The component code to check
 * @returns {Promise<Object|null>} Component data if exists, null if not
 */
async function checkComponentCodeExists(componentCode) {
  try {
    const query = 'SELECT id, component_code, component_description, version FROM sdp_component_details WHERE component_code = $1 AND is_active = true';
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
      fieldErrors: {} // New: Field-specific errors for UI
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

    // Validate date range logic
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
 * Check if mapping already exists in sdp_sku_component_mapping_details table
 * @param {Object} data - Mapping data to check
 * @returns {Promise<Object|null>} Existing mapping if found, null if not
 */
async function checkMappingExists(data) {
  try {
    const query = `
      SELECT * FROM sdp_sku_component_mapping_details 
      WHERE cm_code = $1 AND sku_code = $2 AND component_code = $3 AND version = $4 AND period_id = $5
    `;
    const result = await pool.query(query, [data.cm_code, data.sku_code, data.component_code, data.version, data.period_id]);
    return result.rows[0] || null;
  } catch (error) {
    throw new Error(`Error checking mapping: ${error.message}`);
  }
}

/**
 * Insert component detail into sdp_component_details table
 * @param {Object} data - Component data from UI form
 * @returns {Promise<Object>} Inserted component record
 */
async function insertComponentDetail(data) {
  try {
    const columns = [
      'sku_code', 'formulation_reference', 'material_type_id', 'components_reference', 'component_code',
      'component_description', 'version', 'componentvaliditydatefrom', 'componentvaliditydateto', 'component_material_group',
      'component_quantity', 'component_uom_id', 'component_base_quantity', 'component_base_uom_id',
      'percent_w_w', 'evidence', 'component_packaging_type_id', 'component_packaging_material',
      'helper_column', 'component_unit_weight', 'weight_unit_measure_id', 'percent_mechanical_pcr_content',
      'percent_mechanical_pir_content', 'percent_chemical_recycled_content', 'percent_bio_sourced',
      'material_structure_multimaterials', 'component_packaging_color_opacity', 'component_packaging_level_id',
      'component_dimensions', 'packaging_specification_evidence', 'evidence_of_recycled_or_bio_source',
      'last_update_date', 'category_entry_id', 'data_verification_entry_id', 'user_id', 'signed_off_by',
      'signed_off_date', 'mandatory_fields_completion_status', 'evidence_provided', 'document_status',
      'is_active', 'created_by', 'created_date', 'year', 'component_unit_weight_id', 'cm_code', 'periods'
    ];
    
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
    const query = `INSERT INTO sdp_component_details (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`;
    
    // Use the version passed from the controller (UI version or default 1)
    const componentVersion = data.version || 1;
    
    const values = [
      data.sku_code, data.formulation_reference, data.material_type_id, data.components_reference,
      data.component_code, data.component_description, componentVersion, data.component_valid_from, data.component_valid_to,
      data.component_material_group, data.component_quantity, data.component_uom_id, data.component_base_quantity,
      data.component_base_uom_id, data.percent_w_w, data.evidence, data.component_packaging_type_id,
      data.component_packaging_material, data.helper_column, data.component_unit_weight, data.weight_unit_measure_id,
      data.percent_mechanical_pcr_content, data.percent_mechanical_pir_content, data.percent_chemical_recycled_content,
      data.percent_bio_sourced, data.material_structure_multimaterials, data.component_packaging_color_opacity,
      data.component_packaging_level_id, data.component_dimensions, 'packaging_specification_evidence',
      data.evidence_of_recycled_or_bio_source, data.last_update_date, data.category_entry_id,
      data.data_verification_entry_id, data.user_id, data.signed_off_by, data.signed_off_date,
      data.mandatory_fields_completion_status, data.evidence_provided, data.document_status, data.is_active,
      data.created_by, data.created_date, data.year, data.component_unit_weight_id, data.cm_code, data.periods
    ];
    
    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error) {
    throw new Error(`Error inserting component detail: ${error.message}`);
  }
}

/**
 * Insert component mapping into sdp_sku_component_mapping_details table
 * @param {Object} data - Mapping data
 * @returns {Promise<Object>} Inserted mapping record
 */
async function insertComponentMapping(data) {
  try {
    const result = await checkMappingExists(data);
    if (result) {
      return result; // Return existing mapping
    }
    
    const query = `
      INSERT INTO sdp_sku_component_mapping_details 
      (cm_code, sku_code, component_code, version, component_packaging_type_id, period_id, 
       component_valid_from, component_valid_to, componentvaliditydatefrom, componentvaliditydateto, created_by, is_active) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
      RETURNING *
    `;
    
    const values = [
      data.cm_code, data.sku_code, data.component_code, data.version, data.component_packaging_type_id,
      data.period_id, data.component_valid_from, data.component_valid_to, data.component_valid_from, data.component_valid_to, data.created_by, data.is_active
    ];
    
    const insertResult = await pool.query(query, values);
    return insertResult.rows[0];
  } catch (error) {
    throw new Error(`Error inserting component mapping: ${error.message}`);
  }
}

/**
 * Insert audit log into sdp_component_details_auditlog table
 * @param {Object} data - Audit data including component_id
 * @returns {Promise<Object>} Inserted audit record
 */
async function insertComponentAuditLog(data) {
  try {
    // Audit log insertion
    
    const columns = [
      'component_id', 'sku_code', 'formulation_reference', 'material_type_id', 'components_reference',
      'component_code', 'component_description', 'version', 'componentvaliditydatefrom', 'componentvaliditydateto',
      'component_material_group', 'component_quantity', 'component_uom_id', 'component_base_quantity',
      'component_base_uom_id', 'percent_w_w', 'evidence', 'component_packaging_type_id',
      'component_packaging_material', 'helper_column', 'component_unit_weight', 'weight_unit_measure_id',
      'percent_mechanical_pcr_content', 'percent_mechanical_pir_content', 'percent_chemical_recycled_content',
      'percent_bio_sourced', 'material_structure_multimaterials', 'component_packaging_color_opacity',
      'component_packaging_level_id', 'component_dimensions', 'packaging_specification_evidence',
      'evidence_of_recycled_or_bio_source', 'last_update_date', 'category_entry_id',
      'data_verification_entry_id', 'user_id', 'signed_off_by', 'signed_off_date',
      'mandatory_fields_completion_status', 'evidence_provided', 'document_status', 'is_active',
      'created_by', 'created_date', 'year', 'component_unit_weight_id', 'cm_code', 'periods'
    ];
    
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
    const query = `INSERT INTO sdp_component_details_auditlog (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`;
    
    // Helper function to safely extract single values from potentially array fields
    const safeExtractValue = (value, fieldName) => {
      if (value === null || value === undefined) {
        return null;
      }
      
              // If it's an array, take the first value
        if (Array.isArray(value)) {
          const firstValue = value[0];
          
          // For integer fields, ensure we get a proper integer
          if (['component_id', 'material_type_id', 'component_uom_id', 'component_base_uom_id', 
               'component_packaging_type_id', 'weight_unit_measure_id', 'category_entry_id',
               'data_verification_entry_id', 'user_id', 'component_packaging_level_id', 
               'component_unit_weight_id'].includes(fieldName)) {
            const intValue = parseInt(firstValue);
            if (isNaN(intValue)) {
              return null;
            }
            return intValue;
          }
          
          return firstValue;
        }
        
        // If it's an object, try to extract a meaningful value
        if (typeof value === 'object') {
          return JSON.stringify(value);
        }
        
        // For integer fields, ensure proper conversion
        if (['component_id', 'material_type_id', 'component_uom_id', 'component_base_uom_id', 
             'component_packaging_type_id', 'weight_unit_measure_id', 'category_entry_id',
             'data_verification_entry_id', 'user_id', 'component_packaging_level_id', 
             'component_unit_weight_id'].includes(fieldName)) {
          const intValue = parseInt(value);
          if (isNaN(intValue)) {
            return null;
          }
          return intValue;
        }
      
      return value;
    };
    
    const values = [
      safeExtractValue(data.component_id, 'component_id'),
      safeExtractValue(data.sku_code, 'sku_code'),
      safeExtractValue(data.formulation_reference, 'formulation_reference'),
      safeExtractValue(data.material_type_id, 'material_type_id'),
      safeExtractValue(data.components_reference, 'components_reference'),
      safeExtractValue(data.component_code, 'component_code'),
      safeExtractValue(data.component_description, 'component_description'),
      safeExtractValue(data.version, 'version'),
      safeExtractValue(data.component_valid_from, 'componentvaliditydatefrom'),
      safeExtractValue(data.component_valid_to, 'componentvaliditydateto'),
      safeExtractValue(data.component_material_group, 'component_material_group'),
      safeExtractValue(data.component_quantity, 'component_quantity'),
      safeExtractValue(data.component_uom_id, 'component_uom_id'),
      safeExtractValue(data.component_base_quantity, 'component_base_quantity'),
      safeExtractValue(data.component_base_uom_id, 'component_base_uom_id'),
      safeExtractValue(data.percent_w_w, 'percent_w_w'),
      safeExtractValue(data.evidence, 'evidence'),
      safeExtractValue(data.component_packaging_type_id, 'component_packaging_type_id'),
      safeExtractValue(data.component_packaging_material, 'component_packaging_material'),
      safeExtractValue(data.helper_column, 'helper_column'),
      safeExtractValue(data.component_unit_weight, 'component_unit_weight'),
      safeExtractValue(data.weight_unit_measure_id, 'weight_unit_measure_id'),
      safeExtractValue(data.percent_mechanical_pcr_content, 'percent_mechanical_pcr_content'),
      safeExtractValue(data.percent_mechanical_pir_content, 'percent_mechanical_pir_content'),
      safeExtractValue(data.percent_chemical_recycled_content, 'percent_chemical_recycled_content'),
      safeExtractValue(data.percent_bio_sourced, 'percent_bio_sourced'),
      safeExtractValue(data.material_structure_multimaterials, 'material_structure_multimaterials'),
      safeExtractValue(data.component_packaging_color_opacity, 'component_packaging_color_opacity'),
      safeExtractValue(data.component_packaging_level_id, 'component_packaging_level_id'),
      safeExtractValue(data.component_dimensions, 'component_dimensions'),
      safeExtractValue(data.packaging_specification_evidence, 'packaging_specification_evidence'),
      safeExtractValue(data.evidence_of_recycled_or_bio_source, 'evidence_of_recycled_or_bio_source'),
      safeExtractValue(data.last_update_date, 'last_update_date'),
      safeExtractValue(data.category_entry_id, 'category_entry_id'),
      safeExtractValue(data.data_verification_entry_id, 'data_verification_entry_id'),
      safeExtractValue(data.user_id, 'user_id'),
      safeExtractValue(data.signed_off_by, 'signed_off_by'),
      safeExtractValue(data.signed_off_date, 'signed_off_date'),
      safeExtractValue(data.mandatory_fields_completion_status, 'mandatory_fields_completion_status'),
      safeExtractValue(data.evidence_provided, 'evidence_provided'),
      safeExtractValue(data.document_status, 'document_status'),
      safeExtractValue(data.is_active, 'is_active'),
      safeExtractValue(data.created_by, 'created_by'),
      safeExtractValue(data.created_date, 'created_date'),
      safeExtractValue(data.year, 'year'),
      safeExtractValue(data.component_unit_weight_id, 'component_unit_weight_id'),
      safeExtractValue(data.cm_code, 'cm_code'),
      safeExtractValue(data.periods, 'periods')
    ];
    
    // Inserting audit log
    
    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error) {
    throw new Error(`Error inserting audit log: ${error.message}`);
  }
}

async function insertEvidenceFile(data) {
  try {
    const query = `
      INSERT INTO sdp_evidence 
      (mapping_id, evidence_file_name, evidence_file_url, created_by, created_date, category) 
      VALUES ($1, $2, $3, $4, $5, $6) 
      RETURNING *
    `;
    
    const values = [
      data.mapping_id,
      data.evidence_file_name,
      data.evidence_file_url,
      data.created_by,
      data.created_date,
      data.category
    ];
    
    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error) {
    throw new Error(`Error inserting evidence file: ${error.message}`);
  }
}

/**
 * Safe JSON stringify function to handle circular references
 */
function safeStringify(obj) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch (error) {
    if (error.message.includes('circular')) {
      // Handle circular references by creating a clean copy
      const cleanObj = {};
      Object.keys(obj).forEach(key => {
        try {
          if (typeof obj[key] === 'object' && obj[key] !== null) {
            // For complex objects, just show the keys
            cleanObj[key] = `[Object with keys: ${Object.keys(obj[key]).join(', ')}]`;
          } else {
            cleanObj[key] = obj[key];
          }
        } catch (e) {
          cleanObj[key] = '[Circular Reference]';
          }
      });
      return JSON.stringify(cleanObj, null, 2);
    }
    return `[Error serializing: ${error.message}]`;
  }
}

module.exports = { 
  checkComponentCodeExists, 
  checkComponentDescriptionExists,
  getCurrentReportingPeriod,
  validateComponentValidityDates,
  checkMappingExists, 
  insertComponentDetail, 
  insertComponentMapping, 
  insertComponentAuditLog,
  insertEvidenceFile
};
