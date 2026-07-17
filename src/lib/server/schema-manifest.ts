import { createHash } from 'node:crypto';

export interface RequiredForeignKey {
  name: string;
  table: string;
  columns: string[];
  targetTable: string;
  targetColumns: string[];
  onDelete?: 'SET NULL' | 'CASCADE' | 'RESTRICT' | 'NO ACTION';
}

export interface RequiredConstraint {
  name: string;
  table: string;
  definitionIncludes: string[];
}

export interface RequiredIndex {
  name: string;
  table: string;
  columns: string[];
  unique?: boolean;
  matchName?: boolean;
}

export interface RequiredSchemaObject {
  migrationTag: string;
  table: string;
  columns: string[];
  foreignKeys?: RequiredForeignKey[];
  constraints?: RequiredConstraint[];
  indexes?: RequiredIndex[];
}

export interface SchemaManifestProbeResult {
  tables: string[];
  columns: string[];
  foreignKeyDetails: RequiredForeignKey[];
  constraintDetails: Array<{ name: string; table: string; definition: string }>;
  indexDetails: Array<{ name: string; table: string; columns: string[]; unique: boolean; valid: boolean; ready: boolean; predicate: string | null }>;
  migrationJournalPresent: boolean;
  migrationTags: string[];
  migrationHashes: Record<string, string>;
  functions: string[];
  functionBodies: Record<string, string>;
  triggers: Array<{ name: string; table: string; function: string; enabled: string }>;
}

export const REQUIRED_FROZEN_GUARD_BODY = `BEGIN
  IF EXISTS (SELECT 1 FROM material_links WHERE material_id = OLD.id) THEN
    RAISE EXCEPTION 'material_has_active_links' USING ERRCODE = '23503';
  END IF;
  IF OLD.record_id IS NOT NULL OR OLD.recipe_id IS NOT NULL OR OLD.recipe_step_id IS NOT NULL
     OR OLD.issue_id IS NOT NULL OR OLD.re_evaluation_id IS NOT NULL OR OLD.comparison_cell_id IS NOT NULL THEN
    RAISE EXCEPTION 'material_has_legacy_reference' USING ERRCODE = '23503';
  END IF;
  IF EXISTS (SELECT 1 FROM frozen_material_references WHERE material_id = OLD.id) THEN
    RAISE EXCEPTION 'material_has_frozen_snapshot_reference' USING ERRCODE = '23503';
  END IF;
  IF EXISTS (SELECT 1 FROM report_snapshots WHERE snapshot_json::text LIKE ('%' || OLD.id || '%')) THEN
    RAISE EXCEPTION 'material_has_frozen_snapshot_reference' USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END;`;

const normalizeFunctionBody = (body: string) => body.toLowerCase().replace(/\s+/g, '');
export const REQUIRED_FROZEN_GUARD_BODY_HASH = createHash('sha256')
  .update(normalizeFunctionBody(REQUIRED_FROZEN_GUARD_BODY))
  .digest('hex');

export const REQUIRED_FROZEN_CAPTURE_BODY = `BEGIN
  INSERT INTO frozen_material_references(snapshot_id, material_id)
  SELECT NEW.id, material.id FROM materials material
  WHERE NEW.snapshot_json::text LIKE ('%' || material.id || '%')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;`;
export const REQUIRED_FROZEN_CAPTURE_BODY_HASH = createHash('sha256')
  .update(normalizeFunctionBody(REQUIRED_FROZEN_CAPTURE_BODY))
  .digest('hex');

type SchemaManifestProbe = () => Promise<SchemaManifestProbeResult>;

export const REQUIRED_MIGRATIONS = [
  ['0000_dict_tables_v3_1_1', 1782692768223, '4f563f822765e15fe1f4513f0c6be93ca21a3df045ded7090e8ddc1dd1ef05a0'],
  ['0001_v3_contract_tables', 1782699399639, '98ed470b43f09897a6736b0ad5550b8157a4663ce0f725cc97a4c94bf0ba8481'],
  ['0002_matrix_input_tables', 1782700000000, 'f1abeb555a1161b5b9fc66f61024b4ca8f274b7f92b3ce09202c4d719026473c'],
  ['0003_task_matrix_model', 1783304600614, 'e5ba2322c93b8c9c6aee790fa8768a5b06d632ddab32138d116695fcb7c7646d'],
  ['0004_dynamic_matrix_v3_tables', 1783900000001, '0e4643ee7afd0f1f049ecba425283c25dff5f590edea7a64407599e77dfb7dd0'],
  ['0005_material_asset_and_matrix_issues', 1783900000002, '2168c311647bf28294c83290833a7432c779c3ae9c7829b7314ef4ccab5e076b'],
  ['0006_hermes_agent_tables', 1783900000003, 'c8fbaf8f3fabd90b1ab6e15087288e1bc771f66c1584de9982007ef180d222cc'],
  ['0007_feature_flags_v3_1_2_4', 1783900000004, '3e4e6a074fb51493f26e0ef95167f7a46a0e101a24d6988ad1fc560ea77aa767'],
  ['0008_enable_wave2_matrix_flags', 1783900000005, 'd74981008a173fd190a50ce7641df0fadb9238f67b667188c32121e91c0205c5'],
  ['0009_enable_wave3_formula_flag', 1783900000006, '66069ccf96e794f6e185dec691e9f222285814723d72d952e151deda8df85241'],
  ['0010_enable_wave4_wave5_flags', 1783900000007, '2770d645a5231171005fad29ca41da0e9ccef44ba81b9e6e8eb8ca6602ae8c94'],
  ['0011_agent_qr_binding', 1783930000000, '19666b00404afff1484f493ef978541416372b1b37ffcfaaf8ad02143818faa3'],
  ['0012_task_context_fields', 1783931000000, '7ef1955859c30f6b2f569181162bc0466400795aacf581d5d57e9de2d5bab269'],
  ['0013_atomic_report_snapshot_rpc', 1783950000000, '3c6407d0e2d16e27c0a1ff1f7d30145f4a2f6bbb3a4c7f9dff51b22a8247fe59'],
  ['0014_idempotent_report_snapshot_rpc', 1783951000000, '250b0370729ff799da716734c19339874d2586f5f6213b07877519229e4c9525'],
  ['0015_validate_snapshot_idempotency_replays', 1783952000000, '737ace3a3e8ab87462ed1756f8743390420d7cfddc37abf6faa34087ffbec43f'],
  ['0016_recipe_evaluation_retest', 1783953000000, '5d60a79bb4c4f12a7b795a8085dd3e6e91eec5b74dc0fb558ead5e91cce4e012'],
  ['0017_atomic_recipe_evaluation', 1783954000000, '3405effa28f28059f6e05fb24efa8d4e52c185becd970ab049eba2bc0707ffe8'],
  ['0018_matrix_cell_style_target_id', 1783955000000, 'a202be6b7a105d32c5dc2e64c1bf6b49abc2c54b8138a7a50e94774a6bc07d58'],
  ['0019_backfill_matrix_issue_points', 1783956000000, '609e901770f6f05824e8dd6e7615dcbde68911308cc214bfaea2379dba174d64'],
  ['0020_ai_model_request_options', 1784217600000, '63a0a9248d8a62f85952a2b648427c4747db8a4512e0dfa7c0096beb88855103'],
  ['0021_recipe_material_reuse', 1784217601000, 'f0100aeacb10f51c4e32b23c10e640cb91a0c566247c79ffa8eb69e3984299d1'],
  ['0022_report_snapshot_anchor_integrity', 1784217602000, '3fe16f4d1621c5cf20665304bf552a32d3fb398e1222e225dfc4f8c192a4ec68'],
  ['0023_security_schema_probe_rpc', 1784217603000, '6c22403e51c7c903a0bb359814f59f565593de25c524528c208dd9013a3fa451'],
  ['0024_material_owner_and_wecom_replay', 1784217604000, '8a9bb3153598f2306d161f426a792e68c10eb8d6b5b7bc63f476aef05e03bc43'],
  ['0025_frozen_media_reference_guard', 1784217605000, '93430b992f24e3526b79a72aa2ef0a36c1a499ba265e9170ffe692010bd89365'],
  ['0026_recipe_material_authoritative_links', 1784217606000, '06da19b5ccdcf62791d0e74c3691403d09ad906cee369ca00a1a5e6b1b78b390'],
  ['0027_ilink_personal_bot_accounts', 1784217607000, 'a74ca83029d629f309fd6309a4d805f757b8295fe899260ae6f29b48531c4588'],
  ['0028_ilink_agent_run_trigger', 1784217608000, '0a93d89bee5461417a9b2826faea4757d408b431b94d65608cf7847c74f5760d'],
] as const;

const fk = (name: string, table: string, columns: string[], targetTable: string, targetColumns = ['id'], onDelete?: RequiredForeignKey['onDelete']): RequiredForeignKey => ({ name, table, columns, targetTable, targetColumns, onDelete });
const idx = (name: string, table: string, columns: string[], unique = false): RequiredIndex => ({ name, table, columns, unique });

export const REQUIRED_SCHEMA_MANIFEST: RequiredSchemaObject[] = [
  { migrationTag: '0000_dict_tables_v3_1_1', table: 'platform_users', columns: ['id', 'account', 'role', 'status'], indexes: [{ name: 'platform_users.account unique', table: 'platform_users', columns: ['account'], unique: true, matchName: false }] },
  { migrationTag: '0000_dict_tables_v3_1_1', table: 'experience_tasks', columns: ['id', 'created_by', 'owner_id', 'status'], indexes: [idx('experience_tasks_status_idx', 'experience_tasks', ['status'])] },
  { migrationTag: '0001_v3_contract_tables', table: 'reports', columns: ['id', 'task_id', 'snapshot_id', 'status'], foreignKeys: [fk('reports_task_id_fkey', 'reports', ['task_id'], 'experience_tasks'), fk('reports_snapshot_id_report_snapshots_id_fkey', 'reports', ['snapshot_id'], 'report_snapshots')], indexes: [idx('reports_task_id_idx', 'reports', ['task_id'])] },
  { migrationTag: '0014_idempotent_report_snapshot_rpc', table: 'report_snapshots', columns: ['id', 'report_id', 'snapshot_json', 'idempotency_key', 'idempotency_fingerprint'], foreignKeys: [fk('report_snapshots_report_id_fkey', 'report_snapshots', ['report_id'], 'reports')], indexes: [idx('report_snapshots_report_id_idx', 'report_snapshots', ['report_id']), idx('report_snapshots_report_idempotency_key', 'report_snapshots', ['report_id', 'idempotency_key'], true)] },
  { migrationTag: '0024_material_owner_and_wecom_replay', table: 'materials', columns: ['id', 'file_path', 'status', 'project_id', 'created_by'], foreignKeys: [fk('materials_created_by_fkey', 'materials', ['created_by'], 'platform_users')], indexes: [idx('materials_status_idx', 'materials', ['status']), idx('materials_created_by_idx', 'materials', ['created_by'])] },
  { migrationTag: '0005_material_asset_and_matrix_issues', table: 'material_links', columns: ['id', 'material_id', 'target_type', 'target_id', 'binding_order'], foreignKeys: [fk('ml_material_id_fkey', 'material_links', ['material_id'], 'materials')], indexes: [idx('ml_material_id_idx', 'material_links', ['material_id']), idx('ml_target_idx', 'material_links', ['target_type', 'target_id'])] },
  { migrationTag: '0025_frozen_media_reference_guard', table: 'material_cleanup_jobs', columns: ['id', 'material_id', 'file_key', 'requested_by', 'actor_snapshot', 'status', 'attempts', 'last_error', 'next_attempt_at', 'lease_token', 'lease_until'], foreignKeys: [fk('material_cleanup_jobs_requested_by_fkey', 'material_cleanup_jobs', ['requested_by'], 'platform_users', ['id'], 'SET NULL')], constraints: [{ name: 'material_cleanup_jobs_material_key', table: 'material_cleanup_jobs', definitionIncludes: ['UNIQUE', 'material_id', 'file_key'] }], indexes: [idx('material_cleanup_jobs_status_idx', 'material_cleanup_jobs', ['status', 'created_at'])] },
  { migrationTag: '0025_frozen_media_reference_guard', table: 'frozen_material_references', columns: ['snapshot_id', 'material_id', 'created_at'], foreignKeys: [fk('frozen_material_references_snapshot_id_fkey', 'frozen_material_references', ['snapshot_id'], 'report_snapshots'), fk('frozen_material_references_material_id_fkey', 'frozen_material_references', ['material_id'], 'materials')], indexes: [idx('frozen_material_references_material_idx', 'frozen_material_references', ['material_id'])] },

  { migrationTag: '0003_task_matrix_model', table: 'task_matrices', columns: ['id', 'task_id', 'status', 'created_by'], foreignKeys: [fk('task_matrices_task_id_fkey', 'task_matrices', ['task_id'], 'experience_tasks')], indexes: [idx('task_matrices_task_id_idx', 'task_matrices', ['task_id'])] },
  { migrationTag: '0003_task_matrix_model', table: 'matrix_design_versions', columns: ['id', 'matrix_id', 'status', 'design_hash'], foreignKeys: [fk('matrix_design_versions_matrix_id_fkey', 'matrix_design_versions', ['matrix_id'], 'task_matrices')], indexes: [idx('matrix_design_versions_matrix_id_idx', 'matrix_design_versions', ['matrix_id'])] },
  { migrationTag: '0003_task_matrix_model', table: 'matrix_sections', columns: ['id', 'design_version_id', 'scope', 'sort_order'], foreignKeys: [fk('matrix_sections_design_version_id_fkey', 'matrix_sections', ['design_version_id'], 'matrix_design_versions')], indexes: [idx('matrix_sections_design_version_id_idx', 'matrix_sections', ['design_version_id'])] },
  { migrationTag: '0003_task_matrix_model', table: 'matrix_field_definitions', columns: ['id', 'design_version_id', 'section_id', 'field_kind', 'data_type'], foreignKeys: [fk('matrix_field_definitions_design_version_id_fkey', 'matrix_field_definitions', ['design_version_id'], 'matrix_design_versions')], indexes: [idx('matrix_field_definitions_dv_idx', 'matrix_field_definitions', ['design_version_id'])] },
  { migrationTag: '0003_task_matrix_model', table: 'matrix_groups', columns: ['id', 'matrix_id', 'group_label', 'sort_order'], foreignKeys: [fk('matrix_groups_matrix_id_fkey', 'matrix_groups', ['matrix_id'], 'task_matrices')], indexes: [idx('matrix_groups_matrix_id_idx', 'matrix_groups', ['matrix_id'])] },
  { migrationTag: '0003_task_matrix_model', table: 'matrix_rows', columns: ['id', 'group_id', 'matrix_id', 'version'], foreignKeys: [fk('matrix_rows_group_id_fkey', 'matrix_rows', ['group_id'], 'matrix_groups')], indexes: [idx('matrix_rows_group_id_idx', 'matrix_rows', ['group_id'])] },
  { migrationTag: '0003_task_matrix_model', table: 'matrix_field_values', columns: ['id', 'row_id', 'field_definition_id', 'version'], foreignKeys: [fk('matrix_field_values_row_id_fkey', 'matrix_field_values', ['row_id'], 'matrix_rows')], indexes: [idx('matrix_field_values_row_id_idx', 'matrix_field_values', ['row_id'])] },
  { migrationTag: '0003_task_matrix_model', table: 'matrix_narratives', columns: ['id', 'scope', 'matrix_id', 'group_id', 'content'], foreignKeys: [fk('matrix_narratives_matrix_id_fkey', 'matrix_narratives', ['matrix_id'], 'task_matrices')], indexes: [idx('matrix_narratives_matrix_id_idx', 'matrix_narratives', ['matrix_id'])] },

  { migrationTag: '0004_dynamic_matrix_v3_tables', table: 'matrix_view_definitions', columns: ['id', 'matrix_id', 'status'], foreignKeys: [fk('mvd_matrix_id_fkey', 'matrix_view_definitions', ['matrix_id'], 'task_matrices')], indexes: [idx('matrix_view_definitions_matrix_id_idx', 'matrix_view_definitions', ['matrix_id'])] },
  { migrationTag: '0004_dynamic_matrix_v3_tables', table: 'matrix_hierarchy_nodes', columns: ['id', 'matrix_id', 'parent_id', 'level'], foreignKeys: [fk('mhn_matrix_id_fkey', 'matrix_hierarchy_nodes', ['matrix_id'], 'task_matrices')], indexes: [idx('mhn_matrix_id_idx', 'matrix_hierarchy_nodes', ['matrix_id'])] },
  { migrationTag: '0004_dynamic_matrix_v3_tables', table: 'matrix_leaf_rows', columns: ['id', 'matrix_id', 'level_1_node_id', 'visible_row_index'], foreignKeys: [fk('mlr_matrix_id_fkey', 'matrix_leaf_rows', ['matrix_id'], 'task_matrices')], indexes: [idx('mlr_visible_idx', 'matrix_leaf_rows', ['matrix_id', 'visible_row_index'])] },
  { migrationTag: '0004_dynamic_matrix_v3_tables', table: 'matrix_column_definitions', columns: ['id', 'matrix_id', 'column_zone', 'display_order'], foreignKeys: [fk('mcd_matrix_id_fkey', 'matrix_column_definitions', ['matrix_id'], 'task_matrices')], indexes: [idx('mcd_order_idx', 'matrix_column_definitions', ['matrix_id', 'display_order'])] },
  { migrationTag: '0004_dynamic_matrix_v3_tables', table: 'matrix_cell_values', columns: ['id', 'matrix_id', 'leaf_row_id', 'column_id', 'value_state'], foreignKeys: [fk('mcv_leaf_row_fkey', 'matrix_cell_values', ['leaf_row_id'], 'matrix_leaf_rows')], indexes: [idx('mcv_matrix_row_idx', 'matrix_cell_values', ['matrix_id', 'leaf_row_id'])] },
  { migrationTag: '0018_matrix_cell_style_target_id', table: 'matrix_cell_styles', columns: ['id', 'matrix_id', 'target_type', 'target_id'], foreignKeys: [fk('mcs_matrix_id_fkey', 'matrix_cell_styles', ['matrix_id'], 'task_matrices')], indexes: [idx('mcs_matrix_target_idx', 'matrix_cell_styles', ['matrix_id', 'target_type', 'target_id'])] },
  { migrationTag: '0004_dynamic_matrix_v3_tables', table: 'matrix_formula_definitions_v3', columns: ['id', 'matrix_id', 'column_id', 'expression_display'], foreignKeys: [fk('mfd3_matrix_id_fkey', 'matrix_formula_definitions_v3', ['matrix_id'], 'task_matrices')], indexes: [idx('mfd3_matrix_id_idx', 'matrix_formula_definitions_v3', ['matrix_id'])] },
  { migrationTag: '0004_dynamic_matrix_v3_tables', table: 'matrix_formula_runs_v3', columns: ['id', 'formula_id', 'matrix_id', 'leaf_row_id'], foreignKeys: [fk('mfr3_formula_id_fkey', 'matrix_formula_runs_v3', ['formula_id'], 'matrix_formula_definitions_v3')], indexes: [idx('mfr3_matrix_row_idx', 'matrix_formula_runs_v3', ['matrix_id', 'leaf_row_id'])] },
  { migrationTag: '0004_dynamic_matrix_v3_tables', table: 'matrix_narrative_blocks', columns: ['id', 'matrix_id', 'scope', 'content'], foreignKeys: [fk('mnb_matrix_id_fkey', 'matrix_narrative_blocks', ['matrix_id'], 'task_matrices')], indexes: [idx('mnb_matrix_scope_idx', 'matrix_narrative_blocks', ['matrix_id', 'scope'])] },
  { migrationTag: '0005_material_asset_and_matrix_issues', table: 'matrix_issue_points', columns: ['id', 'matrix_id', 'leaf_row_id', 'column_id', 'linked_issue_id'], foreignKeys: [fk('mip_matrix_id_fkey', 'matrix_issue_points', ['matrix_id'], 'task_matrices')], indexes: [idx('mip_matrix_id_idx', 'matrix_issue_points', ['matrix_id'])] },

  { migrationTag: '0016_recipe_evaluation_retest', table: 'issues', columns: ['id', 'task_id', 'status', 'source_type'], foreignKeys: [fk('issues_task_id_fkey', 'issues', ['task_id'], 'experience_tasks')], constraints: [{ name: 'issues_status_check', table: 'issues', definitionIncludes: ['open', 'rectifying', 'verified_closed', 'waived'] }], indexes: [idx('issues_status_idx', 'issues', ['status'])] },
  { migrationTag: '0016_recipe_evaluation_retest', table: 'issue_re_evaluations', columns: ['id', 'issue_id', 'description', 'created_at'], foreignKeys: [fk('issue_re_evaluations_issue_id_fkey', 'issue_re_evaluations', ['issue_id'], 'issues')], indexes: [idx('issue_re_evaluations_issue_id_idx', 'issue_re_evaluations', ['issue_id'])] },
  { migrationTag: '0001_v3_contract_tables', table: 'rectification_actions', columns: ['id', 'issue_id', 'status', 'action_plan'], indexes: [idx('rectification_actions_issue_idx', 'rectification_actions', ['issue_id', 'created_at'])] },
  { migrationTag: '0001_v3_contract_tables', table: 'verifications', columns: ['id', 'rectification_action_id', 'issue_id', 'result'], foreignKeys: [fk('verifications_rectification_action_id_fkey', 'verifications', ['rectification_action_id'], 'rectification_actions')], indexes: [idx('verifications_action_idx', 'verifications', ['rectification_action_id', 'verified_at'])] },

  { migrationTag: '0006_hermes_agent_tables', table: 'agent_instances', columns: ['id', 'tenant_id', 'status', 'bound_user_id'], foreignKeys: [fk('ai_bound_user_fkey', 'agent_instances', ['bound_user_id'], 'platform_users')], indexes: [idx('ai_tenant_status_idx', 'agent_instances', ['tenant_id', 'status'])] },
  { migrationTag: '0006_hermes_agent_tables', table: 'agent_memory_namespaces', columns: ['id', 'namespace_key', 'agent_instance_id'], foreignKeys: [fk('amn_instance_fkey', 'agent_memory_namespaces', ['agent_instance_id'], 'agent_instances')], indexes: [idx('amn_instance_idx', 'agent_memory_namespaces', ['agent_instance_id'])] },
  { migrationTag: '0006_hermes_agent_tables', table: 'conversations', columns: ['id', 'agent_instance_id', 'platform_user_id', 'task_id', 'status'], foreignKeys: [fk('conv_agent_fkey', 'conversations', ['agent_instance_id'], 'agent_instances')], indexes: [idx('conv_user_idx', 'conversations', ['platform_user_id'])] },
  { migrationTag: '0006_hermes_agent_tables', table: 'conversation_messages', columns: ['id', 'conversation_id', 'event_seq', 'role'], foreignKeys: [fk('cm_conv_fkey', 'conversation_messages', ['conversation_id'], 'conversations')], indexes: [idx('cm_conv_seq_idx', 'conversation_messages', ['conversation_id', 'event_seq'])] },
  { migrationTag: '0006_hermes_agent_tables', table: 'agent_runs', columns: ['id', 'agent_instance_id', 'conversation_id', 'status', 'trace_id'], foreignKeys: [fk('ar_instance_fkey', 'agent_runs', ['agent_instance_id'], 'agent_instances')], indexes: [idx('ar_trace_idx', 'agent_runs', ['trace_id'])] },
  { migrationTag: '0028_ilink_agent_run_trigger', table: 'agent_runs', columns: ['id', 'trigger'], constraints: [{ name: 'agent_runs_trigger_check', table: 'agent_runs', definitionIncludes: ['ilink_ingest', 'wecom_ingest'] }] },
  { migrationTag: '0006_hermes_agent_tables', table: 'agent_suggestion_blocks', columns: ['id', 'agent_run_id', 'status', 'target_entity_type', 'target_entity_id'], foreignKeys: [fk('asb_run_fkey', 'agent_suggestion_blocks', ['agent_run_id'], 'agent_runs')], indexes: [idx('asb_target_idx', 'agent_suggestion_blocks', ['target_entity_type', 'target_entity_id'])] },
  { migrationTag: '0011_agent_qr_binding', table: 'wecom_bindings', columns: ['id', 'platform_user_id', 'wecom_user_id', 'agent_instance_id'], foreignKeys: [fk('wb_platform_user_fkey', 'wecom_bindings', ['platform_user_id'], 'platform_users')], indexes: [idx('wb_wecom_user_idx', 'wecom_bindings', ['wecom_user_id'])] },
  { migrationTag: '0006_hermes_agent_tables', table: 'wecom_media_ingest_jobs', columns: ['id', 'wecom_binding_id', 'wecom_media_id', 'download_status'], indexes: [idx('wmij_status_idx', 'wecom_media_ingest_jobs', ['download_status'])] },
  { migrationTag: '0024_material_owner_and_wecom_replay', table: 'wecom_callback_replays', columns: ['id', 'message_id', 'nonce', 'corp_id', 'message_timestamp', 'received_at'], indexes: [
    { name: 'wecom_callback_replays.message_id unique', table: 'wecom_callback_replays', columns: ['message_id'], unique: true, matchName: false },
    { name: 'wecom_callback_replays.corp_nonce_timestamp unique', table: 'wecom_callback_replays', columns: ['corp_id', 'nonce', 'message_timestamp'], unique: true, matchName: false },
    idx('wecom_callback_replays_received_at_idx', 'wecom_callback_replays', ['received_at']),
  ] },
  { migrationTag: '0027_ilink_personal_bot_accounts', table: 'ilink_bot_accounts', columns: ['id', 'platform_user_id', 'agent_instance_id', 'bot_account_id', 'owner_weixin_user_id', 'token_encrypted', 'status'], foreignKeys: [fk('iba_platform_user_fkey', 'ilink_bot_accounts', ['platform_user_id'], 'platform_users'), fk('iba_agent_fkey', 'ilink_bot_accounts', ['agent_instance_id'], 'agent_instances')], indexes: [idx('iba_agent_idx', 'ilink_bot_accounts', ['agent_instance_id']), idx('iba_status_idx', 'ilink_bot_accounts', ['status'])] },
  { migrationTag: '0023_security_schema_probe_rpc', table: 'security_audit_logs', columns: ['id', 'action', 'outcome', 'metadata', 'created_at'], indexes: [idx('security_audit_logs_action_idx', 'security_audit_logs', ['action'])] },
];

export class SchemaManifestStartupError extends Error {
  readonly code = 'STARTUP_SCHEMA_MANIFEST_INCOMPLETE';
  constructor(kind: string, name: string, migrationTag: string) {
    super(`Startup schema manifest incomplete: missing or invalid ${kind} ${name} (migration ${migrationTag})`);
    this.name = 'SchemaManifestStartupError';
  }
}

const same = (a: string[], b: string[]) => a.length === b.length && a.every((value, index) => value === b[index]);

function assertManifest(result: SchemaManifestProbeResult) {
  const tables = new Set(result.tables);
  const columns = new Set(result.columns);
  for (const item of REQUIRED_SCHEMA_MANIFEST) {
    if (!tables.has(item.table)) throw new SchemaManifestStartupError('table', item.table, item.migrationTag);
    for (const column of item.columns) {
      const qualified = `${item.table}.${column}`;
      if (!columns.has(qualified)) throw new SchemaManifestStartupError('column', qualified, item.migrationTag);
    }
    for (const required of item.foreignKeys ?? []) {
      const found = result.foreignKeyDetails.some((actual) => actual.table === required.table && same(actual.columns, required.columns) && actual.targetTable === required.targetTable && same(actual.targetColumns, required.targetColumns) && (!required.onDelete || actual.onDelete === required.onDelete));
      if (!found) throw new SchemaManifestStartupError('foreign key', required.name, item.migrationTag);
    }
    for (const required of item.constraints ?? []) {
      const found = result.constraintDetails.some((actual) => actual.name === required.name && actual.table === required.table && required.definitionIncludes.every((token) => actual.definition.includes(token)));
      if (!found) throw new SchemaManifestStartupError('constraint', required.name, item.migrationTag);
    }
    for (const required of item.indexes ?? []) {
      const found = result.indexDetails.some((actual) =>
        (required.matchName === false || actual.name === required.name)
        && actual.table === required.table
        && same(actual.columns, required.columns)
        && actual.unique === Boolean(required.unique)
        && (required.matchName !== false || (actual.valid && actual.ready && actual.predicate === null)),
      );
      if (!found) throw new SchemaManifestStartupError('index', required.name, item.migrationTag);
    }
  }

  if (!result.functions.includes('public.guard_frozen_material_delete')) {
    throw new SchemaManifestStartupError('function', 'guard_frozen_material_delete', '0025_frozen_media_reference_guard');
  }
  const guardBody = result.functionBodies['public.guard_frozen_material_delete'] ?? '';
  const guardBodyHash = createHash('sha256').update(normalizeFunctionBody(guardBody)).digest('hex');
  if (guardBodyHash !== REQUIRED_FROZEN_GUARD_BODY_HASH) {
    throw new SchemaManifestStartupError('function body', 'guard_frozen_material_delete', '0025_frozen_media_reference_guard');
  }
  const retentionTrigger = result.triggers.find((trigger) => trigger.name === 'materials_frozen_delete_guard');
  if (!retentionTrigger || retentionTrigger.table !== 'materials' || retentionTrigger.function !== 'guard_frozen_material_delete' || !['O', 'A'].includes(retentionTrigger.enabled)) {
    throw new SchemaManifestStartupError('trigger', 'materials_frozen_delete_guard', '0025_frozen_media_reference_guard');
  }
  const captureTrigger = result.triggers.find((trigger) => trigger.name === 'report_snapshots_material_reference_capture');
  const captureBody = result.functionBodies['public.capture_frozen_material_references'] ?? '';
  const captureBodyHash = createHash('sha256').update(normalizeFunctionBody(captureBody)).digest('hex');
  if (captureBodyHash !== REQUIRED_FROZEN_CAPTURE_BODY_HASH) {
    throw new SchemaManifestStartupError('function body', 'capture_frozen_material_references', '0025_frozen_media_reference_guard');
  }
  if (!result.functions.includes('public.capture_frozen_material_references') || !captureTrigger || captureTrigger.table !== 'report_snapshots' || captureTrigger.function !== 'capture_frozen_material_references' || !['O', 'A'].includes(captureTrigger.enabled)) {
    throw new SchemaManifestStartupError('trigger', 'report_snapshots_material_reference_capture', '0025_frozen_media_reference_guard');
  }

  if (!result.migrationJournalPresent) {
    console.info('[startup-schema] provenance=bootstrap-manifest');
    return;
  }
  const tags = new Set(result.migrationTags);
  for (const [tag, , hash] of REQUIRED_MIGRATIONS) {
    if (!tags.has(tag)) throw new SchemaManifestStartupError('migration tag', tag, tag);
    if (result.migrationHashes[tag] !== hash) throw new SchemaManifestStartupError('migration hash', tag, tag);
  }
  console.info(`[startup-schema] provenance=drizzle-journal head=${REQUIRED_MIGRATIONS.at(-1)?.[0]}`);
}

async function probeLiveSchemaManifest(): Promise<SchemaManifestProbeResult> {
  const { getPool } = await import('@/storage/database/pg-db');
  const result = await getPool().query(`
    SELECT
      COALESCE((SELECT json_agg(tablename) FROM pg_tables WHERE schemaname = 'public'), '[]'::json) AS tables,
      COALESCE((SELECT json_agg(table_name || '.' || column_name) FROM information_schema.columns WHERE table_schema = 'public'), '[]'::json) AS columns,
      COALESCE((SELECT json_agg(json_build_object(
        'name', constraint_row.conname, 'table', source.relname,
        'columns', ARRAY(SELECT attribute.attname FROM unnest(constraint_row.conkey) WITH ORDINALITY key(attnum, ord) JOIN pg_attribute attribute ON attribute.attrelid = constraint_row.conrelid AND attribute.attnum = key.attnum ORDER BY key.ord),
        'targetTable', target.relname,
        'targetColumns', ARRAY(SELECT attribute.attname FROM unnest(constraint_row.confkey) WITH ORDINALITY key(attnum, ord) JOIN pg_attribute attribute ON attribute.attrelid = constraint_row.confrelid AND attribute.attnum = key.attnum ORDER BY key.ord),
        'onDelete', CASE constraint_row.confdeltype WHEN 'n' THEN 'SET NULL' WHEN 'c' THEN 'CASCADE' WHEN 'r' THEN 'RESTRICT' ELSE 'NO ACTION' END
      )) FROM pg_constraint constraint_row JOIN pg_class source ON source.oid = constraint_row.conrelid JOIN pg_namespace source_namespace ON source_namespace.oid = source.relnamespace JOIN pg_class target ON target.oid = constraint_row.confrelid JOIN pg_namespace target_namespace ON target_namespace.oid = target.relnamespace WHERE constraint_row.contype = 'f' AND source_namespace.nspname = 'public' AND target_namespace.nspname = 'public'), '[]'::json) AS foreign_key_details,
      COALESCE((SELECT json_agg(json_build_object('name', constraint_row.conname, 'table', source.relname, 'definition', pg_get_constraintdef(constraint_row.oid))) FROM pg_constraint constraint_row JOIN pg_class source ON source.oid = constraint_row.conrelid WHERE constraint_row.connamespace = 'public'::regnamespace), '[]'::json) AS constraint_details,
      COALESCE((SELECT json_agg(json_build_object(
        'name', index_class.relname, 'table', table_class.relname, 'unique', index_row.indisunique,
        'valid', index_row.indisvalid, 'ready', index_row.indisready, 'predicate', pg_get_expr(index_row.indpred, index_row.indrelid),
        'columns', ARRAY(SELECT attribute.attname FROM unnest(index_row.indkey::smallint[]) WITH ORDINALITY key(attnum, ord) JOIN pg_attribute attribute ON attribute.attrelid = index_row.indrelid AND attribute.attnum = key.attnum WHERE key.attnum > 0 ORDER BY key.ord)
      )) FROM pg_index index_row JOIN pg_class index_class ON index_class.oid = index_row.indexrelid JOIN pg_class table_class ON table_class.oid = index_row.indrelid JOIN pg_namespace namespace ON namespace.oid = table_class.relnamespace WHERE namespace.nspname = 'public'), '[]'::json) AS index_details,
      to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS migration_journal_present
      , COALESCE((SELECT json_agg(namespace.nspname || '.' || procedure.proname) FROM pg_proc procedure JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace WHERE namespace.nspname = 'public'), '[]'::json) AS functions
      , COALESCE((SELECT json_object_agg(namespace.nspname || '.' || procedure.proname, procedure.prosrc) FROM pg_proc procedure JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace WHERE namespace.nspname = 'public'), '{}'::json) AS function_bodies
      , COALESCE((SELECT json_agg(json_build_object('name', trigger.tgname, 'table', owner.relname, 'function', procedure.proname, 'enabled', trigger.tgenabled)) FROM pg_trigger trigger JOIN pg_class owner ON owner.oid = trigger.tgrelid JOIN pg_namespace namespace ON namespace.oid = owner.relnamespace JOIN pg_proc procedure ON procedure.oid = trigger.tgfoid WHERE namespace.nspname = 'public' AND NOT trigger.tgisinternal), '[]'::json) AS triggers
  `);
  const row = result.rows[0] ?? {};
  const migrationTags: string[] = [];
  const migrationHashes: Record<string, string> = {};
  if (row.migration_journal_present === true) {
    const timestamps = REQUIRED_MIGRATIONS.map(([, timestamp]) => timestamp);
    const journal = await getPool().query('SELECT created_at, hash FROM drizzle.__drizzle_migrations WHERE created_at = ANY($1::bigint[])', [timestamps]);
    const byTimestamp = new Map(journal.rows.map((entry) => [Number(entry.created_at), String(entry.hash)]));
    for (const [tag, timestamp] of REQUIRED_MIGRATIONS) {
      const hash = byTimestamp.get(timestamp);
      if (hash) { migrationTags.push(tag); migrationHashes[tag] = hash; }
    }
  }
  return {
    tables: row.tables ?? [], columns: row.columns ?? [],
    foreignKeyDetails: row.foreign_key_details ?? [], constraintDetails: row.constraint_details ?? [], indexDetails: row.index_details ?? [],
    migrationJournalPresent: row.migration_journal_present === true, migrationTags, migrationHashes,
    functions: row.functions ?? [], functionBodies: row.function_bodies ?? {}, triggers: row.triggers ?? [],
  };
}

/** Read-only startup gate. It never creates, changes, or migrates database objects. */
export async function verifyRequiredSchemaManifest(probe: SchemaManifestProbe = probeLiveSchemaManifest): Promise<void> {
  try { assertManifest(await probe()); }
  catch (error) {
    if (error instanceof SchemaManifestStartupError) throw error;
    throw new SchemaManifestStartupError('probe', 'database catalogs', 'unknown');
  }
}
