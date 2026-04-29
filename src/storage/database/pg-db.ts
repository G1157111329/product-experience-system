/**
 * PostgreSQL Direct Connection (via Drizzle ORM + pg driver)
 * Replaces Supabase PostgREST for self-hosted deployments.
 *
 * Environment variables:
 *   DATABASE_URL=postgresql://xp_admin:bear2026@127.0.0.1:5432/xp_experience
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

const DATABASE_URL =
  process.env.DATABASE_URL ||
  `postgresql://xp_admin:bear2026@127.0.0.1:5432/xp_experience`;

let pool: Pool | null = null;
let db: ReturnType<typeof drizzle> | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    pool.on('error', (err) => {
      console.error('Unexpected PostgreSQL pool error:', err);
    });
  }
  return pool;
}

export function getDb() {
  if (!db) {
    db = drizzle({ client: getPool() });
  }
  return db;
}

export { getPool };
