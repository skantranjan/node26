const { 
  checkComponentCodeExists, 
  checkComponentDescriptionExists,
  getCurrentReportingPeriod,
  validateComponentValidityDates,
  insertComponentDetail, 
  insertComponentMapping, 
  insertComponentAuditLog,
  insertEvidenceFile
} = require('../models/model.addComponent');

const { uploadSingleFile } = require('../utils/azureBlobStorage');
const { formatForAPI } = require('../utils/dateFormatter');

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
      
    case 'created_date':
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
 * Controller to add a new component with the specified logic flow
 * Handles multipart/form-data from UI with 48 fields validation
 */
async function addComponentController(request, reply) {
  try {
    // Handle multipart/form-data
    let componentData = {};
    let fileFields = [];
    let fileData = {}; // Store actual file data
    
    if (request.headers['content-type'] && request.headers['content-type'].includes('multipart/form-data')) {
      // Extract form fields from request.body
      if (request.body) {
        console.log(`📊 UI Fields: ${Object.keys(request.body).length} total`);
        
        // Process fields sequentially to handle async operations
        for (const key of Object.keys(request.body)) {
          const fieldValue = request.body[key];
          
          // Log only essential UI data
          if (key === 'version' || key === 'component_code' || key === 'cm_code' || key === 'sku_code') {
            console.log(`📝 ${key}: ${fieldValue}`);
          }
          
          // Handle different field types
          if (key === 'evidence_of_recycled_or_bio_source' || 
              key === 'weight_evidence_files' ||
              key === 'weight_uom_evidence_files' ||
              key === 'packaging_type_evidence_files' ||
              key === 'material_type_evidence_files' ||
              key.endsWith('_files')) {
            // This is a file field - extract file data
            fileFields.push(key);
            
            // Extract file information
            if (fieldValue && typeof fieldValue === 'object') {
              try {
                // Check if it's a file object with properties
                if (fieldValue.filename || fieldValue.name) {
                  const fileInfo = {
                    fieldName: key,
                    filename: fieldValue.filename || fieldValue.name || 'unknown',
                    mimetype: fieldValue.mimetype || fieldValue.type || 'application/octet-stream',
                    size: fieldValue._buf ? fieldValue._buf.length : (fieldValue.size || 0),
                    buffer: fieldValue._buf || fieldValue.buffer || fieldValue.data || null,
                    originalName: fieldValue.originalname || fieldValue.filename || fieldValue.name
                  };
                  
                  // Validate buffer
                  if (!fileInfo.buffer || !Buffer.isBuffer(fileInfo.buffer)) {
                    if (fieldValue.toBuffer && typeof fieldValue.toBuffer === 'function') {
                      try {
                        fileInfo.buffer = await fieldValue.toBuffer();
                        fileInfo.size = fileInfo.buffer ? fileInfo.buffer.length : 0;
                      } catch (bufferError) {
                        console.log(`❌ Failed to get buffer: ${bufferError.message}`);
                      }
                    }
                  }
                  
                  fileData[key] = fileInfo;
                  console.log(`📁 File: ${fileInfo.filename} (${fileInfo.size} bytes)`);
                  
                  // Also store filename in component data for reference
                  const baseFieldName = key.replace('_files', '');
                  componentData[baseFieldName] = fileInfo.filename;
                  
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
                      
                      // Validate buffer for array files too
                      if (!fileInfo.buffer || !Buffer.isBuffer(fileInfo.buffer)) {
                        if (file.toBuffer && typeof file.toBuffer === 'function') {
                          try {
                            fileInfo.buffer = await file.toBuffer();
                            fileInfo.size = fileInfo.buffer ? fileInfo.buffer.length : 0;
                          } catch (bufferError) {
                            console.log(`❌ Failed to get buffer for ${fileInfo.filename}: ${bufferError.message}`);
                          }
                        }
                      }
                      
                      files.push(fileInfo);
                    }
                  }
                  
                  if (files.length > 0) {
                    fileData[key] = files;
                    console.log(`📁 Multiple files: ${files.length} files`);
                    
                    // Store filenames in component data
                    const baseFieldName = key.replace('_files', '');
                    componentData[baseFieldName] = files.map(f => f.filename).join(', ');
                  }
                }
              } catch (error) {
                console.log(`❌ Error extracting file data: ${error.message}`);
              }
            }
          } else {
            // Regular form field - extract clean value and convert to proper type
            const cleanValue = safeExtractFieldValue(fieldValue);
            const dbValue = convertToDatabaseType(key, cleanValue);
            componentData[key] = dbValue;
          }
        }
        
        console.log(`📁 Files: ${Object.keys(fileData).length}`);
        
        // Debug: Check what's in componentData for required fields
        console.log('🔍 Required fields:', {
          cm_code: componentData.cm_code,
          sku_code: componentData.sku_code,
          component_code: componentData.component_code,
          version: componentData.version,
          period_id: componentData.period_id,
          year: componentData.year
        });
      }
    } else {
      // Handle JSON data if sent
      componentData = request.body || {};
    }

    // Ensure year field has the same value as periods field
    if (componentData.periods && !componentData.year) {
      componentData.year = componentData.periods;
    } else if (componentData.year && !componentData.periods) {
      componentData.periods = componentData.year;
    } else if (componentData.periods && componentData.year && componentData.periods !== componentData.year) {
      // If both exist but are different, use periods value for both
      componentData.year = componentData.periods;
    }

    // Log the synchronized values
    console.log(`📅 Year: ${componentData.year}, Periods: ${componentData.periods}`);

    // Validate required fields
    const requiredFields = ['cm_code', 'sku_code', 'component_code', 'version', 'period_id', 'year'];
    const missingFields = requiredFields.filter(field => !componentData[field] || componentData[field].toString().trim() === '');
    
    if (missingFields.length > 0) {
      return reply.code(400).send({
        success: false,
        message: 'Missing required fields',
        missingFields: missingFields
      });
    }

    // Check if component exists
    const componentExists = await checkComponentCodeExists(componentData.component_code);
    let componentId;
    let componentVersion;

    // Determine version: Use UI version if provided, otherwise default to 1
    if (componentData.version && componentData.version > 0) {
      componentVersion = parseInt(componentData.version);
      console.log(`📱 Using version from UI: ${componentVersion}`);
    } else {
      componentVersion = 1;
      console.log(`📱 No version from UI, defaulting to: ${componentVersion}`);
    }

    if (!componentExists) {
      // Insert new component with determined version
      console.log(`🆕 Component does not exist, creating new component with version ${componentVersion}`);
      // Pass the determined version to the insert function
      const insertData = { ...componentData, version: componentVersion };
      const insertedComponent = await insertComponentDetail(insertData);
      componentId = insertedComponent.id;
      console.log(`✅ New component created with ID: ${componentId}, Version: ${componentVersion}`);
    } else {
      // Use existing component ID
      componentId = componentExists.id;
      console.log(`🔄 Using existing component ID: ${componentId}, UI requested version: ${componentVersion}`);
    }

    // NEW VALIDATIONS ADDED HERE
    
    // 1. Check if component_description already exists (must be unique)
    if (componentData.component_description) {
      const descriptionExists = await checkComponentDescriptionExists(componentData.component_description);
      if (descriptionExists && descriptionExists.component_code !== componentData.component_code) {
        return reply.code(400).send({
          success: false,
          message: 'Component description already exists',
          error: 'DUPLICATE_DESCRIPTION',
          errorType: 'VALIDATION_ERROR',
          fieldErrors: {
            component_description: {
              message: 'This description is already used by another component',
              existingComponent: {
                component_code: descriptionExists.component_code,
                component_description: descriptionExists.component_description
              },
              suggestion: 'Use a unique description or check if you meant to update the existing component'
            }
          },
          existingComponent: {
            component_code: descriptionExists.component_code,
            component_description: descriptionExists.component_description
          }
        });
      }
    }

    // 2. Validate component validity dates against current reporting period
    if (componentData.component_valid_from || componentData.component_valid_to) {
      const currentPeriod = await getCurrentReportingPeriod();
      const dateValidation = await validateComponentValidityDates(
        componentData.component_valid_from,
        componentData.component_valid_to,
        currentPeriod
      );

      if (!dateValidation.isValid) {
        return reply.code(400).send({
          success: false,
          message: 'Date validation failed',
          error: 'INVALID_DATES',
          errorType: 'VALIDATION_ERROR',
          validationErrors: dateValidation.errors,
          fieldErrors: dateValidation.fieldErrors,
          currentPeriod: currentPeriod ? currentPeriod.period : null,
          suggestions: {  
            component_valid_from: dateValidation.fieldErrors.component_valid_from?.suggestion,
            component_valid_to: dateValidation.fieldErrors.component_valid_to?.suggestion,
            dateRange: dateValidation.fieldErrors.dateRange?.suggestion
          },
          receivedDates: {
            component_valid_from: formatForAPI(componentData.component_valid_from),
            component_valid_to: formatForAPI(componentData.component_valid_to)
          }
        });
      }
    }

    // Insert component mapping with correct version
    const mappingData = {
      cm_code: componentData.cm_code,
      sku_code: componentData.sku_code,
      component_code: componentData.component_code,
      version: componentVersion, // Use the determined version (not from request)
      component_packaging_type_id: componentData.component_packaging_type_id,
      period_id: componentData.period_id,
      component_valid_from: componentData.component_valid_from,
      component_valid_to: componentData.component_valid_to,
      created_by: componentData.created_by,
      is_active: componentData.is_active
    };

    console.log(`📝 Inserting mapping with version: ${componentVersion}`);

    const insertedMapping = await insertComponentMapping(mappingData);

    // Insert audit log
    const auditData = {
      component_id: componentId,
      sku_code: componentData.sku_code,
      version: componentVersion, // Include the version used
      ...componentData
    };

    const insertedAudit = await insertComponentAuditLog(auditData);

    // Handle file upload and evidence insertion
    let evidenceFileData = null;
    let uploadedFiles = {};
    
    if (Object.keys(fileData).length > 0) {
      console.log('📁 Processing file uploads...');
      
      for (const [fieldName, fileInfo] of Object.entries(fileData)) {
        if (fileInfo.buffer) {
          console.log(`🚀 Uploading file: ${fileInfo.filename}`);
          
          // Determine category and folder based on field name
          let category, folderName;
          switch (fieldName) {
            case 'evidence_of_recycled_or_bio_source':
              category = 'component_evidence';
              folderName = 'evidence';
              break;
            case 'weight_evidence_files':
              category = 'weight_evidence';
              folderName = 'weight';
              break;
            case 'weight_uom_evidence_files':
              category = 'weight_uom_evidence';
              folderName = 'weightUOM';
              break;
            case 'packaging_type_evidence_files':
              category = 'packaging_type_evidence';
              folderName = 'packagingType';
              break;
            case 'material_type_evidence_files':
              category = 'material_type_evidence';
              folderName = 'materialType';
              break;
            default:
              category = 'other_evidence';
              folderName = 'other';
          }
          
          // Upload file to Azure Blob Storage
          const uploadResult = await uploadSingleFile(
            fileInfo.buffer,
            fileInfo.filename,
            fileInfo.mimetype,
            componentData.cm_code,
            componentData.sku_code,
            componentData.component_code,
            componentData.year || componentData.periods,
            folderName  // Pass folder name for organization
          );
          
          if (uploadResult.success) {
            console.log(`✅ File uploaded: ${uploadResult.blobUrl}`);
            
            // Store upload result for this category
            if (!uploadedFiles[category]) {
              uploadedFiles[category] = [];
            }
            uploadedFiles[category].push({
              filename: fileInfo.filename,
              blobUrl: uploadResult.blobUrl,
              size: fileInfo.size,
              mimetype: fileInfo.mimetype
            });
            
            // Insert evidence record into sdp_evidence table
            const evidenceData = {
              mapping_id: insertedMapping.id,
              evidence_file_name: fileInfo.filename,
              evidence_file_url: uploadResult.blobUrl,
              created_by: componentData.created_by || componentData.user_id || '1',
              created_date: new Date(),
              category: category
            };
            
            evidenceFileData = await insertEvidenceFile(evidenceData);
            console.log(`✅ Evidence record created with ID: ${evidenceFileData.id}`);
            
          } else {
            console.error(`❌ File upload failed: ${uploadResult.error}`);
          }
        } else if (Array.isArray(fileInfo)) {
          // Handle multiple files for the same category
          console.log(`📁 Processing ${fileInfo.length} files for ${fieldName}`);
          
          let category, folderName;
          switch (fieldName) {
            case 'weight_evidence_files':
              category = 'weight_evidence';
              folderName = 'weight';
              break;
            case 'weight_uom_evidence_files':
              category = 'weight_uom_evidence';
              folderName = 'weightUOM';
              break;
            case 'packaging_type_evidence_files':
              category = 'packaging_type_evidence';
              folderName = 'packagingType';
              break;
            case 'material_type_evidence_files':
              category = 'material_type_evidence';
              folderName = 'materialType';
              break;
            default:
              category = 'other_evidence';
              folderName = 'other';
          }
          
          if (!uploadedFiles[category]) {
            uploadedFiles[category] = [];
          }
          
          for (const file of fileInfo) {
            if (file.buffer) {
              console.log(`🚀 Uploading file: ${file.filename}`);
              
              const uploadResult = await uploadSingleFile(
                file.buffer,
                file.filename,
                file.mimetype,
                componentData.cm_code,
                componentData.sku_code,
                componentData.component_code,
                componentData.year || componentData.periods,
                folderName
              );
              
              if (uploadResult.success) {
                console.log(`✅ File uploaded: ${uploadResult.blobUrl}`);
                
                uploadedFiles[category].push({
                  filename: file.filename,
                  blobUrl: uploadResult.blobUrl,
                  size: file.size,
                  mimetype: file.mimetype
                });
                
                // Insert evidence record for each file
                const evidenceData = {
                  mapping_id: insertedMapping.id,
                  evidence_file_name: file.filename,
                  evidence_file_url: uploadResult.blobUrl,
                  created_by: componentData.created_by || componentData.user_id || '1',
                  created_date: new Date(),
                  category: category
                };
                
                await insertEvidenceFile(evidenceData);
                console.log(`✅ Evidence record created for ${file.filename}`);
                
              } else {
                console.error(`❌ File upload failed for ${file.filename}: ${uploadResult.error}`);
              }
            }
          }
        }
      }
    }

    // Success response
    const responseData = {
      success: true,
      message: 'Component added successfully',
      data: {
        component_id: componentId,
        mapping_id: insertedMapping.id,
        audit_id: insertedAudit.id,
        evidence_id: evidenceFileData ? evidenceFileData.id : null,
        action: componentExists ? 'mapping_only' : 'component_and_mapping',
        mapping_status: insertedMapping.id ? 'new_mapping' : 'existing_mapping',
        version_used: componentVersion, // Show which version was actually used
        version_source: componentData.version && componentData.version > 0 ? 'ui_requested' : 'defaulted_to_1',
        ui_requested_version: componentData.version || null,
        component_data: {
          ...componentData,
          component_valid_from: formatForAPI(componentData.component_valid_from),
          component_valid_to: formatForAPI(componentData.component_valid_to)
        },
        fileProcessing: {
          totalFileFields: fileFields.length,
          filesWithData: Object.keys(fileData).length,
          uploadedFiles: uploadedFiles,
          fileDetails: Object.keys(fileData).map(fieldName => {
            const files = fileData[fieldName];
            if (Array.isArray(files)) {
              return {
                field: fieldName,
                count: files.length,
                files: files.map(f => ({
                  filename: f.filename,
                  size: f.size,
                  mimetype: f.mimetype
                }))
              };
            } else {
              return {
                field: fieldName,
                count: 1,
                files: [{
                  filename: files.filename,
                  size: files.size,
                  mimetype: files.mimetype
                }]
              };
            }
          })
        },
        fieldSummary: {
          totalFields: Object.keys(request.body || {}).length,
          regularFields: Object.keys(componentData).length,
          fileFields: fileFields.length,
          requiredFields: requiredFields.length
        }
      }
    };

    console.log('✅ Component added successfully');
    return reply.code(201).send(responseData);

  } catch (error) {
    console.error('❌ Error in addComponentController:', error.message);
    return reply.code(500).send({
      success: false,
      message: 'Failed to add component',
      error: error.message
    });
  }
}

module.exports = { addComponentController };
