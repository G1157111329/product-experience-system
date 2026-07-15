import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyMigrationClosure, validateMigrationClosure } from './migration-closure';

const result = verifyMigrationClosure(process.cwd());
assert.equal(result.head, '0025_frozen_media_reference_guard');
assert.equal(result.count, 26);

assert.throws(() => validateMigrationClosure({
  journal: [
    { idx: 0, when: 100, tag: '0000_first' },
    { idx: 1, when: 200, tag: '0001_second' },
  ],
  manifest: [
    ['0000_first', 100, 'hash-a'],
    ['0001_second', 200, 'hash-b'],
  ],
  hashes: new Map([['0000_first', 'hash-a']]),
}), /missing SQL.*0001_second/);

assert.throws(() => validateMigrationClosure({
  journal: [
    { idx: 0, when: 200, tag: '0001_second' },
    { idx: 1, when: 100, tag: '0000_first' },
  ],
  manifest: [
    ['0000_first', 100, 'hash-a'],
    ['0001_second', 200, 'hash-b'],
  ],
  hashes: new Map([['0000_first', 'hash-a'], ['0001_second', 'hash-b']]),
}), /journal\/manifest order mismatch/);

assert.throws(() => validateMigrationClosure({
  journal: [{ idx: 0, when: 100, tag: '0000_first' }],
  manifest: [['0000_first', 100, 'hash-a']],
  hashes: new Map([['0000_first', 'wrong-hash']]),
}), /hash mismatch.*0000_first/);

const bootstrap = readFileSync('database-schema.sql', 'utf8');
assert.match(bootstrap, /target_id VARCHAR\(160\) NOT NULL/, '0018 is represented in bootstrap');
assert.match(bootstrap, /issue_row\.source_report_id = mip\.id/, '0019 backfill is represented in bootstrap upgrades');
assert.match(bootstrap, /request_options JSONB DEFAULT '\{\}'::jsonb/, '0020 AI request options are represented in bootstrap');
assert.match(bootstrap, /ON CONFLICT \(material_id, target_type, target_id\)/, '0021 reusable material binding is represented in bootstrap');
assert.match(bootstrap, /reports_snapshot_id_report_snapshots_id_fkey/, '0022 report anchor constraint is represented in bootstrap');
assert.match(bootstrap, /CREATE OR REPLACE FUNCTION public\.verify_security_schema_probe/, '0023 security probe is represented in bootstrap');

console.log('migration closure contract tests passed');
