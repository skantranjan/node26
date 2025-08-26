const { 
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
} = require('../models/model.updateComponent');

const { uploadSingleFile, deleteFileFromBlob } = require('../utils/azureBlobStorage');

/**
 * Safely serialize object to JSON without circular reference errors
 */
function safeStringify(obj) {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular Reference]';
      }
      seen.add(value);
    }
    return value;
  }, 2);
}

/**
 * Safely extract value from multipart form field with circular reference protection
 */
function safeExtractFieldValue(fieldValue) {
  if (!fieldValue) return null;
  
  // If it's a string or number, return as is
  if (typeof fieldValue === 'string' || typeof fieldValue === 'number') {
    return fieldValue;
  }
  
  // If it's an object, try to extract the value safely
  if (typeof fieldValue === 'object') {
    try {
      // Use WeakSet to track visited objects and prevent circular references
      const visited = new WeakSet();
      
      function safeExtract(obj, depth = 0) {
        if (depth > 3 || visited.has(obj)) {
          return null; // Prevent infinite recursion
        }
        
        visited.add(obj);
        
        // Check for common multipart field structures
        if (obj.value !== undefined) {
          return obj.value;
        }
        
        if (obj.data !== undefined) {
          return obj.data;
        }
        
        if (obj.fields !== undefined) {
          // Try to extract from fields if it's an array
          if (Array.isArray(obj.fields) && obj.fields.length > 0) {
            const firstField = obj.fields[0];
            if (firstField && firstField.value !== undefined) {
              return firstField.value;
            }
          }
          return null;
        }
        
        // Try to get the first available property that looks like a value
        const keys = Object.keys(obj);
        
        // Look for common value properties
        const valueKeys = ['value', 'data', 'text', 'content', 'input'];
        for (const key of valueKeys) {
          if (obj[key] !== undefined) {
            return obj[key];
          }
        }
        
        // If no common value properties found, try the first key
        if (keys.length > 0) {
          const firstKey = keys[0];
          const firstValue = obj[firstKey];
          
          if (typeof firstValue === 'string' || typeof firstValue === 'number') {
            return firstValue;
          }
          
          // If first value is also an object, try to go deeper
          if (typeof firstValue === 'object' && firstValue !== null) {
            const subValue = safeExtract(firstValue, depth + 1);
            if (subValue !== null) {
              return subValue;
            }
          }
        }
        
        return null;
      }
      
      return safeExtract(fieldValue);
      
    } catch (error) {
      console.log(`❌ Error extracting value: ${error.message}`);
      return null;
    }
  }
  
  return fieldValue;
}

/**
 * Convert field value to appropriate database type
 */
function convertToDatabaseType(fieldName, value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  
  // Convert to string first for processing
  const stringValue = value.toString().trim();
  
  // Handle specific field types
  switch (fieldName) {
    case 'version':
      // Convert version to integer (remove decimal if present)
      const versionNum = parseFloat(stringValue);
      if (isNaN(versionNum)) {
        return 1;
      }
      return Math.floor(versionNum);
      
    case 'period_id':
    case 'year':
    case 'periods':
      // Convert to integer
      const periodNum = parseInt(stringValue);
      if (isNaN(periodNum)) {
        return null;
      }
      return periodNum;
      
    case 'component_quantity':
    case 'component_base_quantity':
    case 'component_unit_weight':
    case 'percent_w_w':
    case 'percent_mechanical_pcr_content':
    case 'percent_mechanical_pir_content':
    case 'percent_chemical_recycled_content':
    case 'percent_bio_sourced':
      // Convert to numeric (float)
      const numValue = parseFloat(stringValue);
      if (isNaN(numValue)) {
        return null;
      }
      return numValue;
      
    case 'is_active':
      // Convert to boolean
      return stringValue === 'true' || stringValue === true || stringValue === 1;
      
    case 'last_update_date':
      // Convert to Date object
      if (stringValue === '') return null;
      const dateValue = new Date(stringValue);
      if (isNaN(dateValue.getTime())) {
        return null;
      }
      return dateValue;
      
    default:
      // Return as string for most other fields
      if (stringValue === '') {
        return null;
      }
      return stringValue;
  }
}

/**
 * Controller to update an existing component with the specified logic flow
 * Handles multipart/form-data from UI with flexible field updates
 */
async function updateComponentController(request, reply) {
  try {
    console.log('🔥 ===== COMPONENT UPDATE API CALLED =====');
    
    const componentId = request.params.id;
    console.log(`📝 Component ID from params: ${componentId}`);
    
    // Handle multipart/form-data
    let updateData = {};
    let fileFields = [];
    let fileData = {};
    
    if (request.headers['content-type'] && request.headers['content-type'].includes('multipart/form-data')) {
      console.log('📋 Processing multipart/form-data...');
      
      // Extract form fields from request.body
      if (request.body) {
        console.log(`📊 Total fields received: ${Object.keys(request.body).length}`);
        
        // Process fields sequentially
        for (const key of Object.keys(request.body)) {
          const fieldValue = request.body[key];
          console.log(`🔍 Processing field: ${key}`);
          
          // Handle file fields
          if (key.endsWith('_files') || key === 'evidence_files') {
            fileFields.push(key);
            console.log(`📁 File field detected: ${key}`);
            
            // Extract file information
            if (fieldValue && typeof fieldValue === 'object') {
              try {
                if (fieldValue.filename || fieldValue.name) {
                  const fileInfo = {
                    fieldName: key,
                    filename: fieldValue.filename || fieldValue.name || 'unknown',
                    mimetype: fieldValue.mimetype || fieldValue.type || 'application/octet-stream',
                    size: fieldValue._buf ? fieldValue._buf.length : (fieldValue.size || 0),
                    buffer: fieldValue._buf || fieldValue.buffer || fieldValue.data || null,
                    originalName: fieldValue.originalname || fieldValue.filename || fieldValue.name
                  };
                  
                  fileData[key] = fileInfo;
                  console.log(`📁 File received: ${fileInfo.filename} (${fileInfo.size} bytes, ${fileInfo.mimetype})`);
                  
                } else if (fieldValue.fields && Array.isArray(fieldValue.fields)) {
                  // Handle array of files
                  const files = [];
                  for (let i = 0; i < fieldValue.fields.length; i++) {
                    const file = fieldValue.fields[i];
                    if (file && (file.filename || file.name)) {
                      const fileInfo = {
                        fieldName: key,
                        filename: file.filename || file.name || `file_${i}`,
                        mimetype: file.mimetype || file.type || 'application/octet-stream',
                        size: file._buf ? file._buf.length : (file.size || 0),
                        buffer: file._buf || file.buffer || file.data || null,
                        originalName: file.originalname || file.filename || file.name
                      };
                      files.push(fileInfo);
                    }
                  }
                  
                  if (files.length > 0) {
                    fileData[key] = files;
                    console.log(`📁 Multiple files received: ${files.length} files`);
                  }
                }
              } catch (error) {
                console.log(`❌ Error extracting file data: ${error.message}`);
              }
            }
          } else {
            // Regular form field - extract the actual value safely
            const extractedValue = safeExtractFieldValue(fieldValue);
            updateData[key] = extractedValue;
            console.log(`📝 Form field: ${key} = ${extractedValue}`);
          }
        }
        
        console.log(`\n📁 Files received: ${Object.keys(fileData).length}`);
        console.log(`📝 Fields to update: ${Object.keys(updateData).length}`);
      }
    } else {
      // Handle JSON data if sent
      updateData = request.body || {};
      console.log('📋 Processing JSON data...');
    }

    // Log the complete data received using safe serialization
    console.log('\n🔍 === COMPLETE DATA RECEIVED ===');
    console.log('📝 Update Data Received:', safeStringify(updateData));
    console.log('📁 File Data Received:', safeStringify(fileData));
    
    // Get operation type
    const operationType = updateData.operation || 'update';
    console.log(`🔄 Operation Type: ${operationType}`);
    
    // Get existing component data
    const existingComponent = await getComponentById(componentId);
    if (!existingComponent) {
      return reply.code(404).send({
        success: false,
        message: 'Component not found',
        component_id: componentId
      });
    }
    
    console.log('📋 Existing Component:', safeStringify(existingComponent));
    
    // Define which fields go to which table
    const mappingTableFields = [
      'cm_code', 'sku_code', 'component_code', 'version', 'component_packaging_type_id',
      'period_id', 'component_valid_from', 'component_valid_to', 'created_by', 'is_active'
    ];
    
    const componentTableFields = [
      'component_id', 'sku_code', 'formulation_reference', 'material_type_id', 'components_reference',
      'component_code', 'component_description', 'component_valid_from', 'component_valid_to',
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
    
    // Separate data for different tables
    const mappingData = {};
    const componentData = {};
    
    for (const [key, value] of Object.entries(updateData)) {
      if (key === 'operation') continue; // Skip operation field
      
      if (mappingTableFields.includes(key)) {
        mappingData[key] = value;
      } else if (componentTableFields.includes(key)) {
        componentData[key] = value;
      } else {
        console.log(`⚠️ Unknown field: ${key} - will be ignored`);
      }
    }
    
    console.log('📋 Mapping Table Data:', safeStringify(mappingData));
    console.log('📋 Component Table Data:', safeStringify(componentData));
    
    if (operationType === 'update') {
      // UPDATE OPERATION: Add new entry in mapping table with version increment
      console.log('🔄 Processing UPDATE operation...');
      
      // Get current version and increment it
      const currentVersion = existingComponent.version || 1;
      const newVersion = currentVersion + 1;
      console.log(`📈 Version increment: ${currentVersion} → ${newVersion}`);
      
      // Prepare data for new mapping entry - only use columns that exist in mapping table
      const newMappingData = {
        cm_code: mappingData.cm_code || existingComponent.cm_code,
        sku_code: mappingData.sku_code || existingComponent.sku_code,
        component_code: existingComponent.component_code,
        version: newVersion,
        component_packaging_type_id: mappingData.component_packaging_type_id || existingComponent.component_packaging_type_id,
        period_id: mappingData.period_id || existingComponent.period_id,
        component_valid_from: mappingData.component_valid_from || existingComponent.component_valid_from,
        component_valid_to: mappingData.component_valid_to || existingComponent.component_valid_to,
        created_by: mappingData.created_by || existingComponent.created_by || 'system',
        is_active: mappingData.is_active !== undefined ? mappingData.is_active : true
      };
      
      // Insert new mapping entry
      const newMappingResult = await insertComponentMapping(newMappingData);
      console.log('✅ New mapping entry created:', newMappingResult);
      
      // Insert audit log
      const auditLogData = {
        component_id: componentId,
        action: 'UPDATE_OPERATION',
        old_version: currentVersion,
        new_version: newVersion,
        changes: safeStringify({ mapping: mappingData, component: componentData }),
        created_by: mappingData.created_by || existingComponent.created_by || 'system',
        created_date: new Date()
      };
      
      const auditResult = await insertComponentAuditLog(auditLogData);
      console.log('📝 Audit log created:', auditResult);
      
      return reply.code(200).send({
        success: true,
        message: 'Component updated successfully (new version created)',
        data: {
          component_id: componentId,
          old_version: currentVersion,
          new_version: newVersion,
          operation: 'update',
          mapping_id: newMappingResult.insertId,
          mapping_fields: Object.keys(mappingData),
          component_fields: Object.keys(componentData)
        }
      });
      
    } else if (operationType === 'replace') {
      // REPLACE OPERATION: Replace all data for component code
      console.log('🔄 Processing REPLACE operation...');
      
      // Get component code for replacement
      const componentCode = existingComponent.component_code;
      console.log(`🔍 Replacing data for component code: ${componentCode}`);
      
      // REPLACE only updates component details, no changes to mapping table
      if (Object.keys(componentData).length > 0) {
        const componentUpdateData = {
          ...componentData,
          last_update_date: new Date()
        };
        
        const componentUpdateResult = await updateComponentDetail(componentId, componentUpdateData);
        console.log('✅ Component details updated:', componentUpdateResult);
      } else {
        console.log('ℹ️ No component fields to update');
      }
      
      // Insert audit log
      const auditLogData = {
        component_id: componentId,
        action: 'REPLACE_OPERATION',
        old_version: existingComponent.version || 1,
        new_version: existingComponent.version || 1, // Version stays the same for REPLACE
        changes: safeStringify({ component: componentData }),
        created_by: componentData.created_by || existingComponent.created_by || 'system',
        created_date: new Date()
      };
      
      const auditResult = await insertComponentAuditLog(auditLogData);
      console.log('📝 Audit log created:', auditResult);
      
      return reply.code(200).send({
        success: true,
        message: 'Component replaced successfully (component details updated)',
        data: {
          component_id: componentId,
          component_code: componentCode,
          operation: 'replace',
          component_fields: Object.keys(componentData),
          message: 'Component details updated, mapping table unchanged'
        }
      });
      
    } else {
      return reply.code(400).send({
        success: false,
        message: 'Invalid operation type. Use "update" or "replace"',
        received_operation: operationType
      });
    }
    
  } catch (error) {
    console.error('❌ Error in updateComponentController:', error.message);
    return reply.code(500).send({
      success: false,
      message: 'Failed to process component update',
      error: error.message
    });
  }
}

module.exports = { updateComponentController };
