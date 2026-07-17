import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const schemaSql = readFileSync(resolve(root, 'database-schema.sql'), 'utf8');
const drizzleSchema = readFileSync(resolve(root, 'src/storage/database/shared/schema.ts'), 'utf8');
const migration = readFileSync(resolve(root, 'src/storage/database/shared/migrations/0018_matrix_cell_style_target_id.sql'), 'utf8');

assert.match(schemaSql, /matrix_cell_styles[\s\S]*?target_id VARCHAR\(160\) NOT NULL/);
assert.match(drizzleSchema, /targetId: varchar\("target_id", \{ length: 160 \}\)\.notNull\(\)/);
assert.match(migration, /ALTER COLUMN target_id TYPE VARCHAR\(160\)/);

console.log('matrix cell style schema tests passed');
