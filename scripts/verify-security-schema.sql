DO $$
BEGIN
  IF to_regclass('public.security_audit_logs') IS NULL THEN RAISE EXCEPTION 'missing table: security_audit_logs'; END IF;
  IF to_regclass('public.security_rate_limits') IS NULL THEN RAISE EXCEPTION 'missing table: security_rate_limits'; END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND policyname = 'allow_all') THEN
    RAISE EXCEPTION 'insecure RLS policy found: allow_all';
  END IF;
END $$;

DO $$
DECLARE missing_name TEXT;
BEGIN
  SELECT required.name INTO missing_name FROM unnest(ARRAY[
    'platform_users','experience_tasks','reports','report_snapshots','materials','material_links','material_cleanup_jobs','frozen_material_references',
    'task_matrices','matrix_design_versions','matrix_sections','matrix_field_definitions','matrix_groups','matrix_rows','matrix_field_values','matrix_narratives',
    'matrix_view_definitions','matrix_hierarchy_nodes','matrix_leaf_rows','matrix_column_definitions','matrix_cell_values','matrix_cell_styles',
    'matrix_formula_definitions_v3','matrix_formula_runs_v3','matrix_narrative_blocks','matrix_issue_points',
    'issues','issue_re_evaluations','rectification_actions','verifications',
    'agent_instances','agent_memory_namespaces','conversations','conversation_messages','agent_runs','agent_suggestion_blocks','wecom_bindings','wecom_media_ingest_jobs','wecom_callback_replays'
  ]) required(name) WHERE to_regclass('public.' || required.name) IS NULL LIMIT 1;
  IF missing_name IS NOT NULL THEN RAISE EXCEPTION 'startup schema manifest missing table: %', missing_name; END IF;

  SELECT required.name INTO missing_name FROM unnest(ARRAY[
    'platform_users.role','experience_tasks.owner_id','reports.snapshot_id','report_snapshots.snapshot_json','report_snapshots.idempotency_fingerprint',
    'materials.status','material_links.target_type','material_links.target_id','material_cleanup_jobs.file_key','material_cleanup_jobs.requested_by','material_cleanup_jobs.actor_snapshot','material_cleanup_jobs.next_attempt_at','material_cleanup_jobs.lease_token','material_cleanup_jobs.lease_until','frozen_material_references.snapshot_id','frozen_material_references.material_id','task_matrices.task_id','matrix_design_versions.design_hash',
    'matrix_sections.design_version_id','matrix_field_definitions.field_kind','matrix_groups.matrix_id','matrix_rows.version','matrix_field_values.field_definition_id','matrix_narratives.content',
    'matrix_view_definitions.matrix_id','matrix_hierarchy_nodes.parent_id','matrix_leaf_rows.visible_row_index','matrix_column_definitions.column_zone',
    'matrix_cell_values.value_state','matrix_cell_styles.target_id','matrix_formula_definitions_v3.expression_display','matrix_formula_runs_v3.formula_id',
    'matrix_narrative_blocks.scope','matrix_issue_points.linked_issue_id','issues.status','issue_re_evaluations.issue_id',
    'rectification_actions.issue_id','verifications.rectification_action_id','agent_instances.bound_user_id','agent_memory_namespaces.namespace_key',
    'conversations.platform_user_id','conversation_messages.event_seq','agent_runs.trace_id','agent_suggestion_blocks.target_entity_id',
    'wecom_bindings.wecom_user_id','wecom_media_ingest_jobs.wecom_media_id','wecom_media_ingest_jobs.download_status','materials.created_by',
    'wecom_callback_replays.message_id','wecom_callback_replays.nonce','wecom_callback_replays.corp_id','wecom_callback_replays.message_timestamp','wecom_callback_replays.received_at'
  ]) required(name)
  WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns columns WHERE columns.table_schema='public' AND columns.table_name=split_part(required.name,'.',1) AND columns.column_name=split_part(required.name,'.',2)) LIMIT 1;
  IF missing_name IS NOT NULL THEN RAISE EXCEPTION 'startup schema manifest missing column: %', missing_name; END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='material_cleanup_jobs' AND column_name='lease_token' AND udt_name='uuid') THEN
    RAISE EXCEPTION 'startup schema manifest invalid column type: material_cleanup_jobs.lease_token must be uuid';
  END IF;

  SELECT required.name INTO missing_name FROM (VALUES
    ('reports_snapshot_id_report_snapshots_id_fkey','reports','snapshot_id','report_snapshots','id'),
    ('report_snapshots_report_id_fkey','report_snapshots','report_id','reports','id'),
    ('ml_material_id_fkey','material_links','material_id','materials','id'),
    ('material_cleanup_jobs_requested_by_fkey','material_cleanup_jobs','requested_by','platform_users','id'),
    ('frozen_material_references_snapshot_id_fkey','frozen_material_references','snapshot_id','report_snapshots','id'),
    ('frozen_material_references_material_id_fkey','frozen_material_references','material_id','materials','id'),
    ('materials_created_by_fkey','materials','created_by','platform_users','id'),
    ('task_matrices_task_id_fkey','task_matrices','task_id','experience_tasks','id'),
    ('matrix_sections_design_version_id_fkey','matrix_sections','design_version_id','matrix_design_versions','id'),
    ('mvd_matrix_id_fkey','matrix_view_definitions','matrix_id','task_matrices','id'),
    ('mcv_leaf_row_fkey','matrix_cell_values','leaf_row_id','matrix_leaf_rows','id'),
    ('mip_linked_issue_fkey','matrix_issue_points','linked_issue_id','issues','id'),
    ('issue_re_evaluations_issue_id_fkey','issue_re_evaluations','issue_id','issues','id'),
    ('verifications_rectification_action_id_fkey','verifications','rectification_action_id','rectification_actions','id'),
    ('ai_bound_user_fkey','agent_instances','bound_user_id','platform_users','id'),
    ('conv_agent_fkey','conversations','agent_instance_id','agent_instances','id'),
    ('cm_conv_fkey','conversation_messages','conversation_id','conversations','id'),
    ('ar_instance_fkey','agent_runs','agent_instance_id','agent_instances','id'),
    ('asb_run_fkey','agent_suggestion_blocks','agent_run_id','agent_runs','id')
  ) required(name, source_table, source_column, target_table, target_column)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_constraint constraint_row
    JOIN pg_class source ON source.oid=constraint_row.conrelid JOIN pg_namespace source_namespace ON source_namespace.oid=source.relnamespace
    JOIN pg_class target ON target.oid=constraint_row.confrelid JOIN pg_namespace target_namespace ON target_namespace.oid=target.relnamespace
    WHERE constraint_row.contype='f' AND source_namespace.nspname='public' AND target_namespace.nspname='public'
      AND source.relname=required.source_table AND target.relname=required.target_table
      AND constraint_row.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=source.oid AND attname=required.source_column)]::smallint[]
      AND constraint_row.confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=target.oid AND attname=required.target_column)]::smallint[]
  ) LIMIT 1;
  IF missing_name IS NOT NULL THEN RAISE EXCEPTION 'startup schema manifest missing or invalid foreign key: %', missing_name; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint constraint_row
    JOIN pg_class owner ON owner.oid=constraint_row.conrelid
    JOIN pg_namespace owner_namespace ON owner_namespace.oid=owner.relnamespace
    WHERE owner_namespace.nspname='public' AND owner.relname='material_cleanup_jobs'
      AND constraint_row.conname='material_cleanup_jobs_requested_by_fkey'
      AND constraint_row.contype='f' AND constraint_row.confdeltype='n'
  ) THEN RAISE EXCEPTION 'startup schema manifest cleanup requester FK must use ON DELETE SET NULL'; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint constraint_row JOIN pg_class owner ON owner.oid=constraint_row.conrelid
    JOIN pg_namespace owner_namespace ON owner_namespace.oid=owner.relnamespace
    WHERE constraint_row.conname='issues_status_check' AND owner_namespace.nspname='public' AND owner.relname='issues'
      AND pg_get_constraintdef(constraint_row.oid) LIKE '%open%' AND pg_get_constraintdef(constraint_row.oid) LIKE '%rectifying%'
      AND pg_get_constraintdef(constraint_row.oid) LIKE '%verified_closed%' AND pg_get_constraintdef(constraint_row.oid) LIKE '%waived%') THEN
    RAISE EXCEPTION 'startup schema manifest missing or invalid constraint: issues_status_check';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint constraint_row
    JOIN pg_class owner ON owner.oid=constraint_row.conrelid
    JOIN pg_namespace owner_namespace ON owner_namespace.oid=owner.relnamespace
    WHERE constraint_row.contype='u' AND owner_namespace.nspname='public' AND owner.relname='material_cleanup_jobs'
      AND constraint_row.conkey=ARRAY[
        (SELECT attnum FROM pg_attribute WHERE attrelid=owner.oid AND attname='material_id'),
        (SELECT attnum FROM pg_attribute WHERE attrelid=owner.oid AND attname='file_key')
      ]::smallint[]
  ) THEN RAISE EXCEPTION 'startup schema manifest missing cleanup uniqueness: material_id,file_key'; END IF;

  IF to_regprocedure('public.guard_frozen_material_delete()') IS NULL THEN
    RAISE EXCEPTION 'startup schema manifest missing function: guard_frozen_material_delete';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc procedure JOIN pg_namespace namespace ON namespace.oid=procedure.pronamespace
    WHERE namespace.nspname='public' AND procedure.proname='guard_frozen_material_delete'
      AND lower(procedure.prosrc) LIKE '%from material_links%'
      AND lower(procedure.prosrc) LIKE '%old.record_id is not null%'
      AND lower(procedure.prosrc) LIKE '%old.recipe_id is not null%'
      AND lower(procedure.prosrc) LIKE '%old.recipe_step_id is not null%'
      AND lower(procedure.prosrc) LIKE '%old.issue_id is not null%'
      AND lower(procedure.prosrc) LIKE '%old.re_evaluation_id is not null%'
      AND lower(procedure.prosrc) LIKE '%old.comparison_cell_id is not null%'
      AND lower(procedure.prosrc) LIKE '%from frozen_material_references%'
      AND lower(procedure.prosrc) LIKE '%from report_snapshots%'
      AND lower(procedure.prosrc) LIKE '%raise exception%'
  ) THEN RAISE EXCEPTION 'startup schema manifest invalid function body: guard_frozen_material_delete'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger trigger_row
    JOIN pg_class owner ON owner.oid=trigger_row.tgrelid
    JOIN pg_namespace owner_namespace ON owner_namespace.oid=owner.relnamespace
    JOIN pg_proc procedure ON procedure.oid=trigger_row.tgfoid
    JOIN pg_namespace procedure_namespace ON procedure_namespace.oid=procedure.pronamespace
    WHERE trigger_row.tgname='materials_frozen_delete_guard' AND NOT trigger_row.tgisinternal
      AND trigger_row.tgenabled IN ('O','A') AND owner_namespace.nspname='public' AND owner.relname='materials'
      AND procedure_namespace.nspname='public' AND procedure.proname='guard_frozen_material_delete'
  ) THEN RAISE EXCEPTION 'startup schema manifest missing or disabled trigger: materials_frozen_delete_guard'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger trigger_row
    JOIN pg_class owner ON owner.oid=trigger_row.tgrelid
    JOIN pg_namespace owner_namespace ON owner_namespace.oid=owner.relnamespace
    JOIN pg_proc procedure ON procedure.oid=trigger_row.tgfoid
    WHERE trigger_row.tgname='report_snapshots_material_reference_capture' AND NOT trigger_row.tgisinternal
      AND trigger_row.tgenabled IN ('O','A') AND owner_namespace.nspname='public' AND owner.relname='report_snapshots'
      AND procedure.proname='capture_frozen_material_references'
  ) THEN RAISE EXCEPTION 'startup schema manifest missing or disabled trigger: report_snapshots_material_reference_capture'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc procedure JOIN pg_namespace namespace ON namespace.oid=procedure.pronamespace
    WHERE namespace.nspname='public' AND procedure.proname='capture_frozen_material_references'
      AND regexp_replace(lower(procedure.prosrc), '\s+', '', 'g') =
        'begininsertintofrozen_material_references(snapshot_id,material_id)selectnew.id,material.idfrommaterialsmaterialwherenew.snapshot_json::textlike(''%''||material.id||''%'')onconflictdonothing;returnnew;end;'
  ) THEN RAISE EXCEPTION 'startup schema manifest invalid function body: capture_frozen_material_references'; END IF;

  SELECT required.name INTO missing_name FROM (VALUES
    ('reports_task_id_idx','reports','task_id'),
    ('report_snapshots_report_id_idx','report_snapshots','report_id'),('materials_status_idx','materials','status'),
    ('ml_target_idx','material_links','target_type, target_id'),('material_cleanup_jobs_status_idx','material_cleanup_jobs','status, created_at'),('frozen_material_references_material_idx','frozen_material_references','material_id'),('task_matrices_task_id_idx','task_matrices','task_id'),
    ('matrix_sections_design_version_id_idx','matrix_sections','design_version_id'),('matrix_groups_matrix_id_idx','matrix_groups','matrix_id'),
    ('mcv_matrix_row_idx','matrix_cell_values','matrix_id, leaf_row_id'),('mip_matrix_id_idx','matrix_issue_points','matrix_id'),
    ('issues_status_idx','issues','status'),('issue_re_evaluations_issue_id_idx','issue_re_evaluations','issue_id'),
    ('rectification_actions_issue_idx','rectification_actions','issue_id, created_at'),('verifications_action_idx','verifications','rectification_action_id, verified_at'),
    ('ai_tenant_status_idx','agent_instances','tenant_id, status'),('conv_user_idx','conversations','platform_user_id'),
    ('cm_conv_seq_idx','conversation_messages','conversation_id, event_seq'),('ar_trace_idx','agent_runs','trace_id'),
    ('asb_target_idx','agent_suggestion_blocks','target_entity_type, target_entity_id'),
    ('materials_created_by_idx','materials','created_by'),
    ('wecom_callback_replays_received_at_idx','wecom_callback_replays','received_at')
  ) required(name, owner_table, ordered_columns)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_index index_row JOIN pg_class index_class ON index_class.oid=index_row.indexrelid
    JOIN pg_class owner ON owner.oid=index_row.indrelid JOIN pg_namespace namespace ON namespace.oid=owner.relnamespace
    WHERE namespace.nspname='public' AND index_class.relname=required.name AND owner.relname=required.owner_table
      AND (SELECT string_agg(attribute.attname, ', ' ORDER BY key.ord)
           FROM unnest(index_row.indkey::smallint[]) WITH ORDINALITY key(attnum,ord)
           JOIN pg_attribute attribute ON attribute.attrelid=index_row.indrelid AND attribute.attnum=key.attnum
           WHERE key.attnum>0)=required.ordered_columns
  ) LIMIT 1;
  IF missing_name IS NOT NULL THEN RAISE EXCEPTION 'startup schema manifest missing or invalid index: %', missing_name; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_index index_row JOIN pg_class owner ON owner.oid=index_row.indrelid
    JOIN pg_namespace namespace ON namespace.oid=owner.relnamespace
    WHERE namespace.nspname='public' AND owner.relname='wecom_callback_replays'
      AND index_row.indisunique AND index_row.indisvalid AND index_row.indisready AND index_row.indpred IS NULL
      AND (SELECT string_agg(attribute.attname, ', ' ORDER BY key.ord)
           FROM unnest(index_row.indkey::smallint[]) WITH ORDINALITY key(attnum,ord)
           JOIN pg_attribute attribute ON attribute.attrelid=index_row.indrelid AND attribute.attnum=key.attnum
           WHERE key.attnum>0)='message_id'
  ) THEN RAISE EXCEPTION 'startup schema manifest missing replay uniqueness: wecom_callback_replays.message_id'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_index index_row JOIN pg_class owner ON owner.oid=index_row.indrelid
    JOIN pg_namespace namespace ON namespace.oid=owner.relnamespace
    WHERE namespace.nspname='public' AND owner.relname='wecom_callback_replays'
      AND index_row.indisunique AND index_row.indisvalid AND index_row.indisready AND index_row.indpred IS NULL
      AND (SELECT string_agg(attribute.attname, ', ' ORDER BY key.ord)
           FROM unnest(index_row.indkey::smallint[]) WITH ORDINALITY key(attnum,ord)
           JOIN pg_attribute attribute ON attribute.attrelid=index_row.indrelid AND attribute.attnum=key.attnum
           WHERE key.attnum>0)='corp_id, nonce, message_timestamp'
  ) THEN RAISE EXCEPTION 'startup schema manifest missing replay uniqueness: wecom_callback_replays.corp_nonce_timestamp'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_index index_row JOIN pg_class owner ON owner.oid=index_row.indrelid
    JOIN pg_namespace namespace ON namespace.oid=owner.relnamespace
    WHERE namespace.nspname='public' AND owner.relname='platform_users' AND index_row.indisunique
      AND index_row.indisvalid AND index_row.indisready AND index_row.indpred IS NULL
      AND (SELECT string_agg(attribute.attname, ', ' ORDER BY key.ord)
           FROM unnest(index_row.indkey::smallint[]) WITH ORDINALITY key(attnum,ord)
           JOIN pg_attribute attribute ON attribute.attrelid=index_row.indrelid AND attribute.attnum=key.attnum
           WHERE key.attnum>0)='account'
  ) THEN
    RAISE EXCEPTION 'startup schema manifest missing or invalid index: platform_users.account unique';
  END IF;
END $$;

DO $$
DECLARE missing_tag TEXT;
BEGIN
  IF to_regclass('drizzle.__drizzle_migrations') IS NULL THEN
    RAISE NOTICE 'startup schema provenance: bootstrap-manifest';
  ELSE
    SELECT required.tag INTO missing_tag FROM (VALUES
      ('0000_dict_tables_v3_1_1',1782692768223::bigint,'4f563f822765e15fe1f4513f0c6be93ca21a3df045ded7090e8ddc1dd1ef05a0'),
      ('0001_v3_contract_tables',1782699399639::bigint,'98ed470b43f09897a6736b0ad5550b8157a4663ce0f725cc97a4c94bf0ba8481'),
      ('0002_matrix_input_tables',1782700000000::bigint,'f1abeb555a1161b5b9fc66f61024b4ca8f274b7f92b3ce09202c4d719026473c'),
      ('0003_task_matrix_model',1783304600614::bigint,'e5ba2322c93b8c9c6aee790fa8768a5b06d632ddab32138d116695fcb7c7646d'),
      ('0004_dynamic_matrix_v3_tables',1783900000001::bigint,'0e4643ee7afd0f1f049ecba425283c25dff5f590edea7a64407599e77dfb7dd0'),
      ('0005_material_asset_and_matrix_issues',1783900000002::bigint,'2168c311647bf28294c83290833a7432c779c3ae9c7829b7314ef4ccab5e076b'),
      ('0006_hermes_agent_tables',1783900000003::bigint,'c8fbaf8f3fabd90b1ab6e15087288e1bc771f66c1584de9982007ef180d222cc'),
      ('0007_feature_flags_v3_1_2_4',1783900000004::bigint,'3e4e6a074fb51493f26e0ef95167f7a46a0e101a24d6988ad1fc560ea77aa767'),
      ('0008_enable_wave2_matrix_flags',1783900000005::bigint,'d74981008a173fd190a50ce7641df0fadb9238f67b667188c32121e91c0205c5'),
      ('0009_enable_wave3_formula_flag',1783900000006::bigint,'66069ccf96e794f6e185dec691e9f222285814723d72d952e151deda8df85241'),
      ('0010_enable_wave4_wave5_flags',1783900000007::bigint,'2770d645a5231171005fad29ca41da0e9ccef44ba81b9e6e8eb8ca6602ae8c94'),
      ('0011_agent_qr_binding',1783930000000::bigint,'19666b00404afff1484f493ef978541416372b1b37ffcfaaf8ad02143818faa3'),
      ('0012_task_context_fields',1783931000000::bigint,'7ef1955859c30f6b2f569181162bc0466400795aacf581d5d57e9de2d5bab269'),
      ('0013_atomic_report_snapshot_rpc',1783950000000::bigint,'3c6407d0e2d16e27c0a1ff1f7d30145f4a2f6bbb3a4c7f9dff51b22a8247fe59'),
      ('0014_idempotent_report_snapshot_rpc',1783951000000::bigint,'250b0370729ff799da716734c19339874d2586f5f6213b07877519229e4c9525'),
      ('0015_validate_snapshot_idempotency_replays',1783952000000::bigint,'737ace3a3e8ab87462ed1756f8743390420d7cfddc37abf6faa34087ffbec43f'),
      ('0016_recipe_evaluation_retest',1783953000000::bigint,'5d60a79bb4c4f12a7b795a8085dd3e6e91eec5b74dc0fb558ead5e91cce4e012'),
      ('0017_atomic_recipe_evaluation',1783954000000::bigint,'3405effa28f28059f6e05fb24efa8d4e52c185becd970ab049eba2bc0707ffe8'),
      ('0018_matrix_cell_style_target_id',1783955000000::bigint,'a202be6b7a105d32c5dc2e64c1bf6b49abc2c54b8138a7a50e94774a6bc07d58'),
      ('0019_backfill_matrix_issue_points',1783956000000::bigint,'609e901770f6f05824e8dd6e7615dcbde68911308cc214bfaea2379dba174d64'),
      ('0020_ai_model_request_options',1784217600000::bigint,'63a0a9248d8a62f85952a2b648427c4747db8a4512e0dfa7c0096beb88855103'),
      ('0021_recipe_material_reuse',1784217601000::bigint,'f0100aeacb10f51c4e32b23c10e640cb91a0c566247c79ffa8eb69e3984299d1'),
      ('0022_report_snapshot_anchor_integrity',1784217602000::bigint,'3fe16f4d1621c5cf20665304bf552a32d3fb398e1222e225dfc4f8c192a4ec68'),
      ('0023_security_schema_probe_rpc',1784217603000::bigint,'6c22403e51c7c903a0bb359814f59f565593de25c524528c208dd9013a3fa451'),
      ('0024_material_owner_and_wecom_replay',1784217604000::bigint,'8a9bb3153598f2306d161f426a792e68c10eb8d6b5b7bc63f476aef05e03bc43'),
      ('0025_frozen_media_reference_guard',1784217605000::bigint,'93430b992f24e3526b79a72aa2ef0a36c1a499ba265e9170ffe692010bd89365'),
      ('0026_recipe_material_authoritative_links',1784217606000::bigint,'06da19b5ccdcf62791d0e74c3691403d09ad906cee369ca00a1a5e6b1b78b390')
    ) required(tag,applied_at,expected_hash)
    WHERE NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations migrations WHERE migrations.created_at=required.applied_at AND migrations.hash=required.expected_hash) LIMIT 1;
    IF missing_tag IS NOT NULL THEN RAISE EXCEPTION 'startup schema manifest missing or mismatched migration tag/hash: %', missing_tag; END IF;
    RAISE NOTICE 'startup schema provenance: drizzle-journal head=0026_recipe_material_authoritative_links';
  END IF;
END $$;
