import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  REQUIRED_SCHEMA_MANIFEST,
  REQUIRED_MIGRATIONS,
  REQUIRED_FROZEN_GUARD_BODY,
  REQUIRED_FROZEN_GUARD_BODY_HASH,
  REQUIRED_FROZEN_CAPTURE_BODY,
  REQUIRED_FROZEN_CAPTURE_BODY_HASH,
  SchemaManifestStartupError,
  verifyRequiredSchemaManifest,
  type SchemaManifestProbeResult,
} from './schema-manifest';

function healthyProbe(): SchemaManifestProbeResult {
  return {
    tables: [...new Set(REQUIRED_SCHEMA_MANIFEST.map((item) => item.table))],
    columns: REQUIRED_SCHEMA_MANIFEST.flatMap((item) =>
      item.columns.map((column) => `${item.table}.${column}`),
    ),
    foreignKeyDetails: REQUIRED_SCHEMA_MANIFEST.flatMap((item) => item.foreignKeys ?? []),
    constraintDetails: REQUIRED_SCHEMA_MANIFEST.flatMap((item) =>
      (item.constraints ?? []).map((constraint) => ({
        name: constraint.name,
        table: constraint.table,
        definition: `CHECK (${constraint.definitionIncludes.join(',')})`,
      })),
    ),
    indexDetails: REQUIRED_SCHEMA_MANIFEST.flatMap((item) =>
      (item.indexes ?? []).map((index) => ({
        name: index.matchName === false ? 'platform_users_account_key' : index.name,
        table: index.table,
        columns: index.columns,
        unique: Boolean(index.unique),
        valid: true,
        ready: true,
        predicate: null,
      })),
    ),
    migrationJournalPresent: true,
    migrationTags: REQUIRED_MIGRATIONS.map(([tag]) => tag),
    migrationHashes: Object.fromEntries(REQUIRED_MIGRATIONS.map(([tag, , hash]) => [tag, hash])),
    functions: ['public.guard_frozen_material_delete', 'public.capture_frozen_material_references'],
    functionBodies: {
      'public.guard_frozen_material_delete': REQUIRED_FROZEN_GUARD_BODY,
      'public.capture_frozen_material_references': REQUIRED_FROZEN_CAPTURE_BODY,
    },
    triggers: [
      { name: 'materials_frozen_delete_guard', table: 'materials', function: 'guard_frozen_material_delete', enabled: 'O' },
      { name: 'report_snapshots_material_reference_capture', table: 'report_snapshots', function: 'capture_frozen_material_references', enabled: 'O' },
    ],
  };
}

function without<T>(values: T[], value: T): T[] {
  return values.filter((candidate) => candidate !== value);
}

async function expectNamedFailure(
  probe: SchemaManifestProbeResult,
  kind: string,
  name: string,
) {
  await assert.rejects(
    () => verifyRequiredSchemaManifest(async () => probe),
    (error: unknown) => {
      assert.ok(error instanceof SchemaManifestStartupError);
      assert.equal(error.code, 'STARTUP_SCHEMA_MANIFEST_INCOMPLETE');
      assert.match(error.message, new RegExp(kind));
      assert.match(error.message, new RegExp(name));
      return true;
    },
  );
}

test('accepts a complete runtime schema manifest', async () => {
  await verifyRequiredSchemaManifest(async () => healthyProbe());
});

test('accepts a complete database-schema bootstrap when no Drizzle journal exists', async () => {
  const probe = healthyProbe();
  probe.migrationJournalPresent = false;
  probe.migrationTags = [];
  probe.migrationHashes = {};
  await verifyRequiredSchemaManifest(async () => probe);
});

test('fails closed when a required V3 matrix table is missing', async () => {
  const probe = healthyProbe();
  probe.tables = without(probe.tables, 'task_matrices');
  await expectNamedFailure(probe, 'table', 'task_matrices');
});

test('fails closed when a runtime-critical column is missing', async () => {
  const probe = healthyProbe();
  probe.columns = without(probe.columns, 'report_snapshots.snapshot_json');
  await expectNamedFailure(probe, 'column', 'report_snapshots.snapshot_json');
});

test('fails closed when the frozen snapshot FK is missing', async () => {
  const probe = healthyProbe();
  probe.foreignKeyDetails = probe.foreignKeyDetails.filter(
    (foreignKey) => foreignKey.name !== 'reports_snapshot_id_report_snapshots_id_fkey',
  );
  await expectNamedFailure(
    probe,
    'foreign key',
    'reports_snapshot_id_report_snapshots_id_fkey',
  );
});

test('fails closed when the issue-status constraint is missing', async () => {
  const probe = healthyProbe();
  probe.constraintDetails = probe.constraintDetails.filter(
    (constraint) => constraint.name !== 'issues_status_check',
  );
  await expectNamedFailure(probe, 'constraint', 'issues_status_check');
});

test('fails closed when the material-link index is missing', async () => {
  const probe = healthyProbe();
  probe.indexDetails = probe.indexDetails.filter((index) => index.name !== 'ml_target_idx');
  await expectNamedFailure(probe, 'index', 'ml_target_idx');
});

test('fails closed when a required migration journal tag is missing', async () => {
  const probe = healthyProbe();
  probe.migrationTags = without(probe.migrationTags, '0022_report_snapshot_anchor_integrity');
  await expectNamedFailure(probe, 'migration tag', '0022_report_snapshot_anchor_integrity');
});

test('fails closed when an existing journal has the wrong migration hash', async () => {
  const probe = healthyProbe();
  probe.migrationHashes['0023_security_schema_probe_rpc'] = 'wrong-hash';
  await expectNamedFailure(probe, 'migration hash', '0023_security_schema_probe_rpc');
});

test('bootstrap manifest rejects a missing core platform table', async () => {
  const probe = healthyProbe();
  probe.migrationJournalPresent = false;
  probe.tables = without(probe.tables, 'platform_users');
  await expectNamedFailure(probe, 'table', 'platform_users');
});

test('rejects a same-named FK attached to the wrong table and columns', async () => {
  const probe = healthyProbe();
  probe.foreignKeyDetails = probe.foreignKeyDetails.map((foreignKey) =>
    foreignKey.name === 'reports_snapshot_id_report_snapshots_id_fkey'
      ? { ...foreignKey, table: 'wrong_table', columns: ['wrong_column'] }
      : foreignKey,
  );
  await expectNamedFailure(probe, 'foreign key', 'reports_snapshot_id_report_snapshots_id_fkey');
});

test('rejects a same-named constraint attached to the wrong table or definition', async () => {
  const probe = healthyProbe();
  probe.constraintDetails = probe.constraintDetails.map((constraint) => constraint.name === 'issues_status_check'
    ? { name: 'issues_status_check', table: 'other_table', definition: 'CHECK (true)' }
    : constraint);
  await expectNamedFailure(probe, 'constraint', 'issues_status_check');
});

test('rejects a same-named index with the wrong table or indexed columns', async () => {
  const probe = healthyProbe();
  probe.indexDetails = probe.indexDetails.map((index) =>
    index.name === 'ml_target_idx' ? { ...index, columns: ['target_id'] } : index,
  );
  await expectNamedFailure(probe, 'index', 'ml_target_idx');
});

test('existing journal rejects a missing intermediate migration without bootstrap fallback', async () => {
  const probe = healthyProbe();
  probe.migrationTags = without(probe.migrationTags, '0010_enable_wave4_wave5_flags');
  await expectNamedFailure(probe, 'migration tag', '0010_enable_wave4_wave5_flags');
});

test('accepts the real 0000 platform_users account unique structure without bootstrap index', async () => {
  const probe = healthyProbe();
  probe.indexDetails = probe.indexDetails
    .filter((index) => !(index.table === 'platform_users' && index.columns.join(',') === 'account'))
    .concat({
      name: 'platform_users_account_key',
      table: 'platform_users',
      columns: ['account'],
      unique: true,
      valid: true,
      ready: true,
      predicate: null,
    });
  await verifyRequiredSchemaManifest(async () => probe);
});

test('rejects platform_users account when the real 0000 uniqueness is missing', async () => {
  const probe = healthyProbe();
  probe.indexDetails = probe.indexDetails
    .filter((index) => !(index.table === 'platform_users' && index.columns.join(',') === 'account'))
    .concat({
      name: 'platform_users_account_key',
      table: 'platform_users',
      columns: ['account'],
      unique: false,
      valid: true,
      ready: true,
      predicate: null,
    });
  await expectNamedFailure(probe, 'index', 'platform_users.account');
});

test('rejects a partial unique index for platform_users account', async () => {
  const probe = healthyProbe();
  probe.indexDetails = probe.indexDetails.map((index) =>
    index.table === 'platform_users' && index.columns.join(',') === 'account'
      ? { ...index, predicate: 'account IS NOT NULL' }
      : index,
  );
  await expectNamedFailure(probe, 'index', 'platform_users.account');
});

test('rejects invalid or not-ready unique indexes for platform_users account', async () => {
  for (const state of [{ valid: false }, { ready: false }]) {
    const probe = healthyProbe();
    probe.indexDetails = probe.indexDetails.map((index) =>
      index.table === 'platform_users' && index.columns.join(',') === 'account'
        ? { ...index, ...state }
        : index,
    );
    await expectNamedFailure(probe, 'index', 'platform_users.account');
  }
});

test('SQL verifier scopes FK and issue status constraint owners to public schema', () => {
  const sql = readFileSync('scripts/verify-security-schema.sql', 'utf8');
  assert.match(sql, /source_namespace\.nspname='public'/);
  assert.match(sql, /target_namespace\.nspname='public'/);
  assert.match(sql, /owner_namespace\.nspname='public'/);
});

test('0024 owner and callback replay structures are startup critical', async () => {
  const missingOwner = healthyProbe();
  missingOwner.columns = without(missingOwner.columns, 'materials.created_by');
  await expectNamedFailure(missingOwner, 'column', 'materials.created_by');
  const missingReplay = healthyProbe();
  missingReplay.tables = without(missingReplay.tables, 'wecom_callback_replays');
  await expectNamedFailure(missingReplay, 'table', 'wecom_callback_replays');
});

test('0024 owner backfill SQL is executable in both migration and bootstrap paths', () => {
  const migration = readFileSync('src/storage/database/shared/migrations/0024_material_owner_and_wecom_replay.sql', 'utf8');
  const bootstrap = readFileSync('database-schema.sql', 'utf8');

  assert.match(migration, /\nWITH owner_candidates AS \(/);
  assert.match(bootstrap, /\nWITH owner_candidates AS \(/);
  assert.doesNotMatch(migration, /\n\+WITH owner_candidates AS \(/);
  assert.doesNotMatch(bootstrap, /\n\+WITH owner_candidates AS \(/);
  assert.doesNotMatch(migration, /^\+/m, 'migration must not contain copied patch-prefix lines');
  assert.doesNotMatch(bootstrap, /^\+/m, 'monolithic bootstrap must not contain copied patch-prefix lines');

  const required = REQUIRED_MIGRATIONS.find(([tag]) => tag === '0024_material_owner_and_wecom_replay');
  assert.ok(required, '0024 is required by startup provenance');
  const actualHash = createHash('sha256').update(migration).digest('hex');
  assert.equal(actualHash, required[2], 'startup manifest uses the real 0024 SQL SHA256');
  const verifier = readFileSync('scripts/verify-security-schema.sql', 'utf8');
  assert.match(verifier, new RegExp(`0024_material_owner_and_wecom_replay',${required[1]}::bigint,'${actualHash}`));
  const journal = JSON.parse(readFileSync('src/storage/database/shared/migrations/meta/_journal.json', 'utf8')) as { entries: Array<{ tag: string; when: number }> };
  assert.ok(journal.entries.some((entry) => entry.tag === required[0] && entry.when === required[1]), 'Drizzle journal timestamp matches startup provenance');
});

test('0024 never treats a material binder as the asset owner', () => {
  const migration = readFileSync('src/storage/database/shared/migrations/0024_material_owner_and_wecom_replay.sql', 'utf8');
  const bootstrap = readFileSync('database-schema.sql', 'utf8');
  for (const sql of [migration, bootstrap]) {
    assert.doesNotMatch(sql, /SELECT\s+link\.material_id\s*,\s*link\.bound_by/i, 'an admin binder must not replace the owning task user');
    assert.match(sql, /link\.target_type='record'[\s\S]*?COALESCE\(task\.owner_id, task\.created_by\)/i);
  }
});

test('0024 leaves same-priority owner conflicts unresolved', () => {
  for (const sql of [
    readFileSync('src/storage/database/shared/migrations/0024_material_owner_and_wecom_replay.sql', 'utf8'),
    readFileSync('database-schema.sql', 'utf8'),
  ]) {
    assert.doesNotMatch(sql, /DISTINCT ON \(material_id\)[\s\S]*ORDER BY material_id, priority, user_id/i, 'lexical user order must never decide ownership');
    assert.match(sql, /HAVING\s+COUNT\(DISTINCT\s+candidate\.user_id\)\s*=\s*1/i, 'ambiguous best-priority candidates remain NULL');
  }
});

test('0024 selects one unique highest-trust owner before considering lower-trust candidates', () => {
  for (const sql of [
    readFileSync('src/storage/database/shared/migrations/0024_material_owner_and_wecom_replay.sql', 'utf8'),
    readFileSync('database-schema.sql', 'utf8'),
  ]) {
    assert.match(sql, /SELECT\s+material_id\s*,\s*MIN\(priority\)\s+AS\s+priority[\s\S]*GROUP BY material_id/i, 'minimum numeric priority establishes the trusted tier');
    assert.match(sql, /candidate\.material_id\s*=\s*best\.material_id[\s\S]*candidate\.priority\s*=\s*best\.priority/i, 'lower-trust owners are excluded before uniqueness is evaluated');
  }
});

test('uses the real WeCom ingest media column from migration 0006', async () => {
  const probe = healthyProbe();
  probe.columns = without(probe.columns, 'wecom_media_ingest_jobs.wecom_media_id');
  probe.columns.push('wecom_media_ingest_jobs.media_id');
  await expectNamedFailure(probe, 'column', 'wecom_media_ingest_jobs.wecom_media_id');
});

test('matrix_groups uses the canonical 0003 group_label contract across bootstrap, migration, ORM, and startup gate', () => {
  const bootstrap = readFileSync('database-schema.sql', 'utf8');
  const migration = readFileSync('src/storage/database/shared/migrations/0003_task_matrix_model.sql', 'utf8');
  const drizzleSchema = readFileSync('src/storage/database/shared/schema.ts', 'utf8');
  const manifestItem = REQUIRED_SCHEMA_MANIFEST.find((item) => item.table === 'matrix_groups');

  assert.match(bootstrap, /CREATE TABLE IF NOT EXISTS matrix_groups[\s\S]*?group_label VARCHAR\(200\) NOT NULL/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS matrix_groups[\s\S]*?group_label varchar\(200\) NOT NULL/);
  assert.match(drizzleSchema, /groupLabel:\s*varchar\("group_label"/);
  assert.deepEqual(manifestItem?.columns, ['id', 'matrix_id', 'group_label', 'sort_order']);
  assert.match(bootstrap, /ALTER TABLE matrix_groups RENAME COLUMN name TO group_label/);
});

test('agent_runs bootstrap retains the canonical 0006 lookup indexes', () => {
  const bootstrap = readFileSync('database-schema.sql', 'utf8');
  const migration = readFileSync('src/storage/database/shared/migrations/0006_hermes_agent_tables.sql', 'utf8');
  const agentRunManifest = REQUIRED_SCHEMA_MANIFEST.find((item) => item.table === 'agent_runs');

  for (const indexName of ['ar_conv_idx', 'ar_trace_idx']) {
    const expected = new RegExp(`CREATE INDEX IF NOT EXISTS ${indexName} ON agent_runs\\(`);
    assert.match(bootstrap, expected);
    assert.match(migration, new RegExp(`CREATE INDEX IF NOT EXISTS ${indexName} ON agent_runs \\(`));
  }
  assert.ok(agentRunManifest?.indexes?.some((index) => index.name === 'ar_trace_idx' && index.columns.join(',') === 'trace_id'));
});

test('agent bootstrap retains the manifest-critical target and WeCom lookup indexes', () => {
  const bootstrap = readFileSync('database-schema.sql', 'utf8');
  const migration = readFileSync('src/storage/database/shared/migrations/0006_hermes_agent_tables.sql', 'utf8');
  const expectedIndexes = [
    ['asb_target_idx', 'agent_suggestion_blocks', 'target_entity_type, target_entity_id'],
    ['wb_wecom_user_idx', 'wecom_bindings', 'wecom_user_id'],
  ] as const;

  for (const [indexName, tableName, columns] of expectedIndexes) {
    const expected = new RegExp(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableName} ?\\(${columns}\\)`);
    assert.match(bootstrap, expected);
    assert.match(migration, expected);
  }
});

test('0023 database is stale after the 0024 security migration', async () => {
  const probe = healthyProbe();
  probe.migrationTags = without(probe.migrationTags, '0024_material_owner_and_wecom_replay');
  await expectNamedFailure(probe, 'migration tag', '0024_material_owner_and_wecom_replay');
});

test('0024 database is stale after the frozen-media retention migration', async () => {
  const probe = healthyProbe();
  probe.migrationTags = without(probe.migrationTags, '0025_frozen_media_reference_guard');
  await expectNamedFailure(probe, 'migration tag', '0025_frozen_media_reference_guard');
});

test('0025 SQL hash, journal timestamp, cleanup manifest and frozen guard stay aligned', () => {
  const migration = readFileSync('src/storage/database/shared/migrations/0025_frozen_media_reference_guard.sql', 'utf8');
  const required = REQUIRED_MIGRATIONS.find(([tag]) => tag === '0025_frozen_media_reference_guard');
  assert.ok(required);
  assert.equal(createHash('sha256').update(migration).digest('hex'), required[2]);
  const guardBody = migration.match(/CREATE OR REPLACE FUNCTION guard_frozen_material_delete\(\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/)?.[1];
  assert.ok(guardBody);
  assert.equal(createHash('sha256').update(guardBody.toLowerCase().replace(/\s+/g, '')).digest('hex'), REQUIRED_FROZEN_GUARD_BODY_HASH);
  const captureBody = migration.match(/CREATE OR REPLACE FUNCTION capture_frozen_material_references\(\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/)?.[1];
  assert.ok(captureBody);
  const normalizedCaptureBody = captureBody.toLowerCase().replace(/\s+/g, '');
  assert.equal(createHash('sha256').update(normalizedCaptureBody).digest('hex'), REQUIRED_FROZEN_CAPTURE_BODY_HASH);
  assert.ok(readFileSync('scripts/verify-security-schema.sql', 'utf8').includes(`'${normalizedCaptureBody.replaceAll("'", "''")}'`));
  assert.match(migration, /BEFORE DELETE ON materials/);
  assert.match(migration, /report_snapshots[\s\S]*snapshot_json::text LIKE/);
  assert.ok(REQUIRED_SCHEMA_MANIFEST.some((item) => item.table === 'material_cleanup_jobs'));
  assert.ok(REQUIRED_SCHEMA_MANIFEST.some((item) => item.table === 'frozen_material_references'));
  assert.match(migration, /CREATE TRIGGER report_snapshots_material_reference_capture AFTER INSERT ON report_snapshots/);
  assert.match(migration, /INSERT INTO frozen_material_references\(snapshot_id, material_id\)[\s\S]*FROM report_snapshots snapshot/);
  assert.match(migration, /requested_by varchar\(36\),[\s\S]*actor_snapshot varchar\(100\) NOT NULL/);
  assert.match(migration, /material_cleanup_jobs_requested_by_fkey[\s\S]*ON DELETE SET NULL/);
  assert.match(migration, /lease_token uuid/);
  assert.match(readFileSync('scripts/verify-security-schema.sql', 'utf8'), /lease_token' AND udt_name='uuid'/);
});

test('journal-less bootstrap fails closed without the 0025 function or enabled materials trigger', async () => {
  const missingFunction = healthyProbe();
  missingFunction.migrationJournalPresent = false;
  missingFunction.functions = [];
  await expectNamedFailure(missingFunction, 'function', 'guard_frozen_material_delete');
  const disabledTrigger = healthyProbe();
  disabledTrigger.migrationJournalPresent = false;
  disabledTrigger.triggers = [{ name: 'materials_frozen_delete_guard', table: 'materials', function: 'guard_frozen_material_delete', enabled: 'D' }];
  await expectNamedFailure(disabledTrigger, 'trigger', 'materials_frozen_delete_guard');
});

test('replica-only frozen media trigger fails closed while origin and always modes pass', async () => {
  const replica = healthyProbe();
  replica.triggers[0].enabled = 'R';
  await expectNamedFailure(replica, 'trigger', 'materials_frozen_delete_guard');
  for (const enabled of ['O', 'A']) {
    const probe = healthyProbe();
    probe.triggers[0].enabled = enabled;
    await verifyRequiredSchemaManifest(async () => probe);
  }
  const verifier = readFileSync('scripts/verify-security-schema.sql', 'utf8');
  assert.match(verifier, /tgenabled IN \('O','A'\)/);
  assert.doesNotMatch(verifier, /tgenabled\s*<>\s*'D'/);
});

test('empty RETURN OLD guard body fails closed and frozen reference table is startup critical', async () => {
  const emptyGuard = healthyProbe();
  emptyGuard.functionBodies['public.guard_frozen_material_delete'] = 'BEGIN RETURN OLD; END';
  await expectNamedFailure(emptyGuard, 'function body', 'guard_frozen_material_delete');
  const missingReferences = healthyProbe();
  missingReferences.tables = without(missingReferences.tables, 'frozen_material_references');
  await expectNamedFailure(missingReferences, 'table', 'frozen_material_references');
});

test('empty or semantically wrong frozen capture function fails closed', async () => {
  for (const body of ['BEGIN RETURN NEW; END', 'BEGIN DELETE FROM frozen_material_references; RETURN NEW; END']) {
    const probe = healthyProbe();
    probe.functionBodies['public.capture_frozen_material_references'] = body;
    await expectNamedFailure(probe, 'function body', 'capture_frozen_material_references');
  }
});

test('0025 upgrades a legacy cleanup queue and reconstructs the requester FK semantically', async () => {
  const migration = readFileSync('src/storage/database/shared/migrations/0025_frozen_media_reference_guard.sql', 'utf8');
  assert.match(migration, /ALTER TABLE material_cleanup_jobs ADD COLUMN IF NOT EXISTS lease_token uuid/);
  assert.match(migration, /owner_namespace\.nspname = 'public'[\s\S]*owner\.relname = 'material_cleanup_jobs'[\s\S]*attname = 'requested_by'/);
  assert.match(migration, /DROP CONSTRAINT %I/);
  assert.match(migration, /REFERENCES public\.platform_users\(id\) ON DELETE SET NULL/);
  const wrongDeleteAction = healthyProbe();
  wrongDeleteAction.foreignKeyDetails = wrongDeleteAction.foreignKeyDetails.map((foreignKey) =>
    foreignKey.name === 'material_cleanup_jobs_requested_by_fkey' ? { ...foreignKey, onDelete: 'RESTRICT' } : foreignKey,
  );
  await expectNamedFailure(wrongDeleteAction, 'foreign key', 'material_cleanup_jobs_requested_by_fkey');
});

test('cleanup uniqueness is structural and rejects the same name on wrong columns', async () => {
  const probe = healthyProbe();
  probe.constraintDetails = probe.constraintDetails.map((constraint) => constraint.name === 'material_cleanup_jobs_material_key'
    ? { ...constraint, definition: 'UNIQUE (material_id)' }
    : constraint);
  await expectNamedFailure(probe, 'constraint', 'material_cleanup_jobs_material_key');
});

test('callback replay uniqueness is semantic, valid, ready, exact and non-partial', async () => {
  for (const requirement of [
    { name: 'wecom_callback_replays.message_id unique', columns: ['message_id'] },
    { name: 'wecom_callback_replays.corp_nonce_timestamp unique', columns: ['corp_id', 'nonce', 'message_timestamp'] },
  ]) {
    for (const mutation of [
      { columns: [...requirement.columns].reverse().concat('wrong') },
      { unique: false }, { valid: false }, { ready: false }, { predicate: 'message_id IS NOT NULL' },
    ]) {
      const probe = healthyProbe();
      probe.indexDetails = probe.indexDetails.map((index) => index.table === 'wecom_callback_replays' && index.columns.join(',') === requirement.columns.join(',') ? { ...index, ...mutation } : index);
      await expectNamedFailure(probe, 'index', requirement.name);
    }
  }
});
