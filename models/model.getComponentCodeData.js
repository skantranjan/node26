const pool = require('../config/db.config');

/**
 * Get component details by cm_code and component_code using three-table approach
 * 1. Check sdp_sku_component_mapping_details for cm_code + component_code
 * 2. Get component details from sdp_component_details by component_code
 * 3. Get evidence from sdp_evidence by component_id
 */
async function getComponentCodeData(cmCode, componentCode) {
  // Step 1: Check if cm_code + component_code exists in mapping table
  // Get the LATEST VERSION for the component
  const mappingQuery = `
    SELECT 
      id as mapping_id,
      cm_code,
      sku_code,
      component_code,
      version as mapping_version,
      component_packaging_type_id,
      period_id,
      component_valid_from,
      component_valid_to,
      componentvaliditydatefrom,
      componentvaliditydateto,
      created_by as mapping_created_by,
      created_at as mapping_created_at,
      updated_at as mapping_updated_at,
      is_active as mapping_is_active
    FROM sdp_sku_component_mapping_details 
    WHERE cm_code = $1 AND component_code = $2
    ORDER BY version DESC, id DESC
    LIMIT 1
  `;

  const mappingResult = await pool.query(mappingQuery, [cmCode, componentCode]);
  const mappings = mappingResult.rows;

  if (mappings.length === 0) {
    // No mapping found, return empty result
    return [];
  }

  // Step 2: Get component details from sdp_component_details by component_code
  const componentQuery = `
    SELECT 
      id, sku_code, formulation_reference, material_type_id, components_reference, 
      component_code, component_description, version, component_valid_from, component_valid_to, 
      componentvaliditydatefrom, componentvaliditydateto,
      component_material_group, component_quantity, component_uom_id, component_base_quantity, 
      component_base_uom_id, percent_w_w, evidence, component_packaging_type_id, 
      component_packaging_material, helper_column, component_unit_weight, weight_unit_measure_id, 
      percent_mechanical_pcr_content, percent_mechanical_pir_content, percent_chemical_recycled_content, 
      percent_bio_sourced, material_structure_multimaterials, component_packaging_color_opacity, 
      component_packaging_level_id, component_dimensions, packaging_specification_evidence, 
      evidence_of_recycled_or_bio_source, last_update_date, category_entry_id, data_verification_entry_id, 
      user_id, signed_off_by, signed_off_date, mandatory_fields_completion_status, evidence_provided, 
      document_status, is_active, created_by, created_date, year, component_unit_weight_id, cm_code, periods
    FROM sdp_component_details 
    WHERE component_code = $1
    ORDER BY id DESC
  `;

  const componentResult = await pool.query(componentQuery, [componentCode]);
  const components = componentResult.rows;

  // Step 3: For each component, get its evidence data and combine with mapping data
  const finalResult = [];
  
  for (const component of components) {
    // Get evidence for this component
    const evidenceQuery = `
      SELECT 
        id, component_id, evidence_file_name, evidence_file_url, created_by, created_date, category
      FROM sdp_evidence 
      WHERE component_id = $1
      ORDER BY id DESC
    `;

    const evidenceResult = await pool.query(evidenceQuery, [component.id]);
    const evidence = evidenceResult.rows;

    // Find corresponding mapping data for this component
    const componentMappings = mappings.filter(mapping => 
      mapping.component_code === component.component_code
    );

    // Create result with mapping data, component details, and evidence
    componentMappings.forEach(mapping => {
      finalResult.push({
        mapping: mapping,
        component: component,
        evidence: evidence
      });
    });
  }

  return finalResult;
}

/**
 * Get component details by component_code only (without cm_code dependency)
 * This function retrieves all components with the given component_code across all CMs
 * Now also includes mapping details for complete response structure
 * @param {string} componentCode - The component code to search for
 * @returns {Promise<Array>} Array of component details with evidence and mapping
 */
async function getComponentCodeDataByCode(componentCode) {
  // Get component details from sdp_component_details by component_code
  const componentQuery = `
    SELECT 
      id, sku_code, formulation_reference, material_type_id, components_reference, 
      component_code, component_description, version, component_valid_from, component_valid_to, 
      componentvaliditydatefrom, componentvaliditydateto,
      component_material_group, component_quantity, component_uom_id, component_base_quantity, 
      component_base_uom_id, percent_w_w, evidence, component_packaging_type_id, 
      component_packaging_material, helper_column, component_unit_weight, weight_unit_measure_id, 
      percent_mechanical_pcr_content, percent_mechanical_pir_content, percent_chemical_recycled_content, 
      percent_bio_sourced, material_structure_multimaterials, component_packaging_color_opacity, 
      component_packaging_level_id, component_dimensions, packaging_specification_evidence, 
      evidence_of_recycled_or_bio_source, last_update_date, category_entry_id, data_verification_entry_id, 
      user_id, signed_off_by, signed_off_date, mandatory_fields_completion_status, evidence_provided, 
      document_status, is_active, created_by, created_date, year, component_unit_weight_id, cm_code, periods
    FROM sdp_component_details 
    WHERE component_code = $1 AND is_active = true
    ORDER BY id DESC
  `;

  const componentResult = await pool.query(componentQuery, [componentCode]);
  const components = componentResult.rows;

  if (components.length === 0) {
    return [];
  }

  // For each component, get its evidence data and mapping data
  const finalResult = [];
  
  for (const component of components) {
    // Get evidence for this component
    const evidenceQuery = `
      SELECT 
        id, component_id, evidence_file_name, evidence_file_url, created_by, created_date, category
      FROM sdp_evidence 
      WHERE component_id = $1
      ORDER BY id DESC
    `;

    const evidenceResult = await pool.query(evidenceQuery, [component.id]);
    const evidence = evidenceResult.rows;

    // Get mapping data for this component (latest version across all CMs)
    const mappingQuery = `
      SELECT 
        id as mapping_id,
        cm_code,
        sku_code,
        component_code,
        version as mapping_version,
        component_packaging_type_id,
        period_id,
        component_valid_from,
        component_valid_to,
        componentvaliditydatefrom,
        componentvaliditydateto,
        created_by as mapping_created_by,
        created_at as mapping_created_at,
        updated_at as mapping_updated_at,
        is_active as mapping_is_active
      FROM sdp_sku_component_mapping_details 
      WHERE component_code = $1
      ORDER BY version DESC, id DESC
      LIMIT 1
    `;

    const mappingResult = await pool.query(mappingQuery, [componentCode]);
    const mapping = mappingResult.rows[0] || null;

    // Create result with component details, evidence, and mapping
    finalResult.push({
      mapping: mapping,
      component: component,
      evidence: evidence
    });
  }

  return finalResult;
}

module.exports = { getComponentCodeData, getComponentCodeDataByCode }; 