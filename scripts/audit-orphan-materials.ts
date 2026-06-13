import { config } from 'dotenv';
import { readdir, stat } from 'fs/promises';
import path from 'path';
import { Pool } from 'pg';

config({ path: '.env.local' });
config();

const databaseUrl = process.env.DATABASE_URL;
const uploadDir = path.resolve(process.env.LOCAL_UPLOAD_DIR || path.join(process.cwd(), 'public', 'uploads'));
const publicBasePath = (process.env.LOCAL_PUBLIC_BASE_PATH || '/uploads').replace(/^\/+|\/+$/g, '');

function normalizeMaterialKey(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('http') || trimmed.startsWith('data:')) return null;
  return trimmed
    .replace(/\\/g, '/')
    .replace(new RegExp(`^/?${publicBasePath}/`), '')
    .replace(/^\/+/, '');
}

async function listFiles(root: string, dir = root): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(root, fullPath));
      continue;
    }
    if (!entry.isFile() || entry.name === '.gitkeep') continue;
    files.push(path.relative(root, fullPath).replace(/\\/g, '/'));
  }

  return files;
}

async function main() {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to audit material records');
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const [{ rows }, localFiles] = await Promise.all([
      pool.query<{ file_path: string | null; file_url: string | null }>('select file_path, file_url from materials'),
      listFiles(uploadDir).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return [];
        throw error;
      }),
    ]);

    const dbKeys = new Set<string>();
    for (const row of rows) {
      const filePath = normalizeMaterialKey(row.file_path);
      const fileUrl = normalizeMaterialKey(row.file_url);
      if (filePath) dbKeys.add(filePath);
      if (fileUrl) dbKeys.add(fileUrl);
    }

    const localFileSet = new Set(localFiles);
    const orphanFiles = localFiles.filter((file) => !dbKeys.has(file)).sort();
    const missingFiles = [...dbKeys].filter((key) => !localFileSet.has(key)).sort();
    const orphanBytes = await orphanFiles.reduce(async (totalPromise, file) => {
      const total = await totalPromise;
      const fileStat = await stat(path.join(uploadDir, file));
      return total + fileStat.size;
    }, Promise.resolve(0));

    console.log(JSON.stringify({
      mode: 'dry-run',
      uploadDir,
      materialRows: rows.length,
      dbFileKeys: dbKeys.size,
      localFiles: localFiles.length,
      orphanFiles: orphanFiles.length,
      orphanBytes,
      missingFiles: missingFiles.length,
      samples: {
        orphanFiles: orphanFiles.slice(0, 20),
        missingFiles: missingFiles.slice(0, 20),
      },
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
