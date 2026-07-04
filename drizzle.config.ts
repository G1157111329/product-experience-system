import { defineConfig } from "drizzle-kit";
import { getDevFallback } from "./src/lib/server/security-config";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  getDevFallback(
    "DATABASE_URL",
    "postgresql://xp_dev:change-me-dev-only@127.0.0.1:5432/xp_experience",
  );

export default defineConfig({
  schema: "./src/storage/database/shared/schema.ts",
  out: "./src/storage/database/shared/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: DATABASE_URL,
  },
  verbose: true,
  strict: true,
  schemaFilter: ["public"],
});