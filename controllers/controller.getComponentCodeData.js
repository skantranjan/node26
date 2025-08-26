const { getComponentCodeData, getComponentCodeDataByCode } = require('../models/model.getComponentCodeData');
const { formatForAPI } = require('../utils/dateFormatter');

/**
 * Helper function to transform component data for frontend compatibility
 * Converts string IDs to numbers and formats periods/year for autocomplete
 */
function transformComponentData(component) {
  return {
    id: parseInt(component.id) || component.id,
    component_code: component.component_code,
    component_description: component.component_description,
    version: parseInt(component.version) || component.version || 1, // Include version field
    material_type_id: parseInt(component.material_type_id) || component.material_type_id,
    component_valid_from: formatForAPI(component.component_valid_from),
    component_valid_to: formatForAPI(component.component_valid_to),
    componentvaliditydatefrom: formatForAPI(component.componentvaliditydatefrom),
    componentvaliditydateto: formatForAPI(component.componentvaliditydateto),
    component_material_group: component.component_material_group,
    component_quantity: component.component_quantity,
    component_uom_id: parseInt(component.component_uom_id) || component.component_uom_id,
    component_base_quantity: component.component_base_quantity,
    component_base_uom_id: parseInt(component.component_base_uom_id) || component.component_base_uom_id,
    percent_w_w: component.percent_w_w,
    // Force numeric conversion for packaging type ID (handle cases like "PKG01")
    component_packaging_type_id: parseInt(component.component_packaging_type_id) || 1,
    component_packaging_material: component.component_packaging_material,
    component_unit_weight: component.component_unit_weight,
    // Force numeric conversion for weight unit measure ID (handle cases like "kg")
    weight_unit_measure_id: parseInt(component.weight_unit_measure_id) || 1,
    percent_mechanical_pcr_content: component.percent_mechanical_pcr_content,
    percent_mechanical_pir_content: component.percent_mechanical_pir_content,
    percent_chemical_recycled_content: component.percent_chemical_recycled_content,
    percent_bio_sourced: component.percent_bio_sourced,
    material_structure_multimaterials: component.material_structure_multimaterials,
    component_packaging_color_opacity: component.component_packaging_color_opacity,
    // Force numeric conversion for packaging level ID (handle cases like "Primary")
    component_packaging_level_id: parseInt(component.component_packaging_level_id) || 1,
    component_dimensions: component.component_dimensions,
    // Return actual database values for periods and year (no transformation)
    periods: component.periods,
    year: component.year
  };
}

/**
 * Controller to get component details by cm_code and component_code using three-table approach
 */
async function getComponentCodeDataController(request, reply) {
  try {
    console.log('🔍 ===== GET COMPONENT CODE DATA API =====');
    
    const { cm_code, component_code } = request.body;
    
    console.log('📋 Request Parameters:');
    console.log('  - CM Code:', cm_code);
    console.log('  - Component Code:', component_code);

    // Validate required parameters
    if (!cm_code || cm_code.trim() === '') {
      return reply.code(400).send({
        success: false,
        message: 'cm_code is required'
      });
    }
    
    if (!component_code || component_code.trim() === '') {
      return reply.code(400).send({
        success: false,
        message: 'component_code is required'
      });
    }

    // Get component details and evidence by cm_code and component_code
    console.log('\n📊 === FETCHING DATA FROM DATABASE ===');
    const results = await getComponentCodeData(cm_code, component_code);
    
    console.log(`✅ Found ${results.length} results for CM: ${cm_code} and component_code: ${component_code}`);

    // Transform results to match the exact expected response structure
    const componentsWithEvidence = results.map(result => ({
      mapping_details: {
        mapping_id: result.mapping.id,
        cm_code: result.mapping.cm_code,
        sku_code: result.mapping.sku_code,
        component_code: result.mapping.component_code,
        version: result.mapping.mapping_version,
        component_packaging_type_id: result.mapping.component_packaging_type_id,
        period_id: result.mapping.period_id,
        component_valid_from: formatForAPI(result.mapping.component_valid_from),
        component_valid_to: formatForAPI(result.mapping.component_valid_to),
        componentvaliditydatefrom: formatForAPI(result.mapping.componentvaliditydatefrom),
        componentvaliditydateto: formatForAPI(result.mapping.componentvaliditydateto),
        created_by: result.mapping.mapping_created_by,
        created_at: result.mapping.mapping_created_at,
        updated_at: result.mapping.mapping_updated_at,
        is_active: result.mapping.mapping_is_active
      },
      component_details: transformComponentData(result.component),
      evidence_files: result.evidence.map(evidence => ({
        id: parseInt(evidence.id) || evidence.id,
        category: evidence.category,
        evidence_file_name: evidence.evidence_file_name,
        evidence_file_url: evidence.evidence_file_url
      }))
    }));

    const responseData = {
      success: true,
      data: {
        components_with_evidence: componentsWithEvidence
      }
    };

    console.log('\n📤 === API RESPONSE ===');
    console.log('Status Code: 200');
    console.log('Response Body:');
    console.log(JSON.stringify(responseData, null, 2));

    reply.code(200).send(responseData);

  } catch (error) {
    console.error('❌ Error in getComponentCodeDataController:', error);
    reply.code(500).send({
      success: false,
      message: 'Failed to fetch component data',
      error: error.message
    });
  }
}

/**
 * Controller to get component details by component_code only (GET endpoint)
 * This matches the documented API: GET /get-component-code-data?component_code=${componentCode}
 */
async function getComponentCodeDataByCodeController(request, reply) {
  try {
    console.log('🔍 ===== GET COMPONENT CODE DATA BY CODE API =====');
    
    const { component_code } = request.query;
    
    console.log('📋 Request Parameters:');
    console.log('  - Component Code:', component_code);

    // Validate required parameters
    if (!component_code || component_code.trim() === '') {
      return reply.code(400).send({
        success: false,
        message: 'component_code query parameter is required'
      });
    }

    // Get component details and evidence by component_code only
    console.log('\n📊 === FETCHING DATA FROM DATABASE ===');
    const results = await getComponentCodeDataByCode(component_code);
    
    console.log(`✅ Found ${results.length} results for component_code: ${component_code}`);
    
    // Log the raw database values for debugging
    if (results.length > 0) {
      console.log('\n🔍 === RAW DATABASE VALUES ===');
      console.log('Periods:', results[0].component.periods);
      console.log('Year:', results[0].component.year);
      console.log('Periods type:', typeof results[0].component.periods);
      console.log('Year type:', typeof results[0].component.year);
    }

    // Transform results to match the expected response structure
    const componentsWithEvidence = results.map(result => ({
      mapping_details: result.mapping ? {
        mapping_id: result.mapping.mapping_id,
        cm_code: result.mapping.cm_code,
        sku_code: result.mapping.sku_code,
        component_code: result.mapping.component_code,
        version: result.mapping.mapping_version,
        component_packaging_type_id: result.mapping.component_packaging_type_id,
        period_id: result.mapping.period_id,
        component_valid_from: formatForAPI(result.mapping.component_valid_from),
        component_valid_to: formatForAPI(result.mapping.component_valid_to),
        componentvaliditydatefrom: formatForAPI(result.mapping.componentvaliditydatefrom),
        componentvaliditydateto: formatForAPI(result.mapping.componentvaliditydateto),
        created_by: result.mapping.mapping_created_by,
        created_at: result.mapping.mapping_created_at,
        updated_at: result.mapping.mapping_updated_at,
        is_active: result.mapping.mapping_is_active
      } : null,
      component_details: transformComponentData(result.component),
      evidence_files: result.evidence.map(evidence => ({
        id: parseInt(evidence.id) || evidence.id,
        category: evidence.category,
        evidence_file_name: evidence.evidence_file_name,
        evidence_file_url: evidence.evidence_file_url
      }))
    }));

    const responseData = {
      success: true,
      data: {
        components_with_evidence: componentsWithEvidence
      }
    };

    console.log('\n📤 === API RESPONSE ===');
    console.log('Status Code: 200');
    console.log('Response Body:');
    console.log(JSON.stringify(responseData, null, 2));

    reply.code(200).send(responseData);

  } catch (error) {
    console.error('❌ Error in getComponentCodeDataByCodeController:', error);
    reply.code(500).send({
      success: false,
      message: 'Failed to fetch component data by component code',
      error: error.message
    });
  }
}

module.exports = { getComponentCodeDataController, getComponentCodeDataByCodeController }; 