import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  REQUIRED_SCHEMA_MANIFEST,
  REQUIRED_MIGRATIONS,
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
  probe.constraintDetails = [{
    name: 'issues_status_check', table: 'other_table', definition: 'CHECK (true)',
  }];
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
