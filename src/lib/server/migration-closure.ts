import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REQUIRED_MIGRATIONS } from './schema-manifest';

type JournalEntry = { idx: number; when: number; tag: string };
type ManifestEntry = readonly [tag: string, when: number, hash: string];

export function validateMigrationClosure(input: {
  journal: readonly JournalEntry[];
  manifest: readonly ManifestEntry[];
  hashes: ReadonlyMap<string, string>;
}) {
  if (input.journal.length !== input.manifest.length) {
    throw new Error(`journal/manifest length mismatch: ${input.journal.length} != ${input.manifest.length}`);
  }
  for (let index = 0; index < input.manifest.length; index += 1) {
    const journal = input.journal[index];
    const [tag, when, expectedHash] = input.manifest[index];
    if (!journal || journal.idx !== index || journal.tag !== tag || journal.when !== when) {
      throw new Error(`journal/manifest order mismatch at index ${index}: ${journal?.tag ?? 'missing'} != ${tag}`);
    }
    const actualHash = input.hashes.get(tag);
    if (!actualHash) throw new Error(`missing SQL for journal tag ${tag}`);
    if (actualHash !== expectedHash) throw new Error(`migration hash mismatch for ${tag}: ${actualHash} != ${expectedHash}`);
  }
  return {
    count: input.manifest.length,
    head: input.manifest.at(-1)?.[0] ?? null,
  };
}

export function verifyMigrationClosure(root: string) {
  const migrationDirectory = join(root, 'src/storage/database/shared/migrations');
  const journal = JSON.parse(readFileSync(join(migrationDirectory, 'meta/_journal.json'), 'utf8')) as {
    entries: JournalEntry[];
  };
  const hashes = new Map<string, string>();
  for (const entry of journal.entries) {
    const sqlPath = join(migrationDirectory, `${entry.tag}.sql`);
    if (!existsSync(sqlPath)) continue;
    hashes.set(entry.tag, createHash('sha256').update(readFileSync(sqlPath)).digest('hex'));
  }
  return validateMigrationClosure({ journal: journal.entries, manifest: REQUIRED_MIGRATIONS, hashes });
}
