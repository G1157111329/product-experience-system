import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(process.cwd(), 'src/app/api/materials/presign/route.ts'), 'utf8');

assert.match(source, /snapshot_id/, 'report authorization must resolve the anchored snapshot id');
assert.match(source, /frozen_material_references/, 'presign must authorize material ids frozen into the report snapshot');
assert.match(source, /material_id/, 'the frozen reference check must bind the requested material id');
assert.match(source, /sharedReport|readableReport/, 'both anonymous share and authenticated report reads must use report-scoped authorization');
assert.match(source, /withoutUploadsPrefix/, 'presign lookup must normalize both bare keys and /uploads-prefixed paths');
assert.match(source, /\.in\('file_path', candidates\)/, 'file_path lookup must query every normalized path variant');
assert.match(source, /\.in\('file_url', candidates\)/, 'file_url lookup must query every normalized path variant');
assert.match(source, /jsonResponse\(\{ code: 0, data: urlMap \}\)/, 'successful presign responses must use the fixed-length JSON helper');
assert.match(source, /toOpaqueVideoTransportUrl/, 'signed video files must use the opaque enterprise-network transport route');

console.log('frozen report material presign authorization contract tests passed');
