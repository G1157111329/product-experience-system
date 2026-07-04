import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { getDevFallback } from "@/lib/server/security-config";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  getDevFallback(
    "DATABASE_URL",
    "postgresql://xp_dev:change-me-dev-only@127.0.0.1:5432/xp_experience",
  );

const MIGRATIONS_FOLDER =
  process.env.DRIZZLE_MIGRATIONS_FOLDER ||
  "./src/storage/database/shared/migrations";

async function main() {
  if (!DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  const pool = new Pool({
    connectionString: DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 5000,
  });
  const db = drizzle({ client: pool });
  console.log(`[migrate] applying migrations from ${MIGRATIONS_FOLDER}`);
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    console.log("[migrate] ok");
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error("[migrate] failed:", err);
    await pool.end();
    process.exit(1);
  }
}

main();