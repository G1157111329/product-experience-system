import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync('src/storage/database/shared/migrations/0012_task_context_fields.sql', 'utf8');
const bootstrap = readFileSync('database-schema.sql', 'utf8');
const service = readFileSync('src/lib/server/content-delete-service.ts', 'utf8');

assert.match(migration, /check_records ADD COLUMN IF NOT EXISTS recipe_id[\s\S]*REFERENCES recipes\(id\) ON DELETE SET NULL/i);
assert.match(migration, /check_records ADD COLUMN IF NOT EXISTS recipe_step_id[\s\S]*REFERENCES recipe_steps\(id\) ON DELETE SET NULL/i);
assert.match(bootstrap, /CREATE TABLE IF NOT EXISTS check_records[\s\S]*recipe_id VARCHAR\(36\)[\s\S]*recipe_step_id VARCHAR\(36\)/i);
assert.doesNotMatch(
  bootstrap.match(/CREATE TABLE IF NOT EXISTS check_records[\s\S]*?\n\);/)?.[0] ?? '',
  /recipe_(?:step_)?id[^\n]*REFERENCES/i,
  'bootstrap intentionally has no recipe FK, so runtime cleanup must not depend on cascades',
);
assert.match(service, /tx\.update\(checkRecords\)\.set\(\{ recipeStepId: null \}\)/);
assert.match(service, /tx\.update\(checkRecords\)\.set\(\{ recipeId: null, recipeStepId: null \}\)/);

console.log('content delete migration/bootstrap contract tests passed');
