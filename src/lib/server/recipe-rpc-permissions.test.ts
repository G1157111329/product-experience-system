import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

for (const path of [
  'src/storage/database/shared/migrations/0017_atomic_recipe_evaluation.sql',
  'database-schema.sql',
]) {
  const source = readFileSync(path, 'utf8');
  for (const rpc of ['save_recipe_evaluation', 'apply_issue_retest']) {
    assert.match(
      source,
      new RegExp(`REVOKE ALL ON FUNCTION public\\.${rpc}\\(JSONB\\) FROM PUBLIC`, 'i'),
      `${path} must revoke PUBLIC execution for ${rpc}`,
    );
    assert.match(
      source,
      new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${rpc}\\(JSONB\\) TO service_role`, 'i'),
      `${path} must conditionally grant ${rpc} to service_role`,
    );
  }
}

console.log('recipe RPC permission source contracts passed');
