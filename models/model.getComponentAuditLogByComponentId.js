const pool = require('../config/db.config');

/**
 * Get component audit log records by component_id
 */
async function getComponentAuditLogByComponentId(componentId) {
  const query = `
    SELECT id, component_id, sku_code, formulation_reference, material_type_id, 
           components_reference, component_code, component_description, component_valid_from, 
           component_valid_to, component_material_group, component_quantity, component_uom_id, 
           component_base_quantity, component_base_uom_id, percent_w_w, evidence, 
           component_packaging_type_id, component_packaging_material, helper_column, 
           component_unit_weight, weight_unit_measure_id, percent_mechanical_pcr_content, 
           percent_mechanical_pir_content, percent_chemical_recycled_content, percent_bio_sourced, 
           material_structure_multimaterials, component_packaging_color_opacity, 
           component_packaging_level_id, component_dimensions, packaging_specification_evidence, 
           evidence_of_recycled_or_bio_source, last_update_date, category_entry_id, 
           data_verification_entry_id, user_id, signed_off_by, signed_off_date, 
           mandatory_fields_completion_status, evidence_provided, document_status, is_active, 
           created_by, created_date, year, component_unit_weight_id, cm_code, periods
    FROM sdp_component_details_auditlog 
    WHERE component_id = $1 
    ORDER BY created_date DESC
  `;

  const result = await pool.query(query, [componentId]);
  return result.rows;
}

module.exports = { getComponentAuditLogByComponentId }; 