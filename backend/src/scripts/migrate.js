/**
 * Schema migration runner (#584).
 *
 * Applies SQL migration files from db/migrations/app/ against the app
 * database (DATABASE_URL). Tracks applied migrations in a schema_migrations
 * table so each file runs exactly once.
 *
 * Bootstrapping existing databases:
 *   If the schema_migrations table is empty but the Organizations table
 *   already exists, the database predates the migration system. All current
 *   migration files are recorded as applied (without running them) so the
 *   next genuinely new migration runs cleanly.
 *
 * Fresh databases:
 *   Migration files are run in filename order. 0001-baseline.sql creates the
 *   full schema for non-Docker deployments. Docker deployments already have
 *   the schema from init scripts, so the bootstrap path above handles them.
 *
 * Usage:
 *   Called automatically by initializeServer() in src/index.js (skipped in
 *   test mode, which uses SQLite).
 *   Can also be run standalone: NODE_ENV=production node src/scripts/migrate.js
 */
/* eslint-disable no-console */

import { readdir, readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../db/migrations/app");

const CREATE_MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id        SERIAL PRIMARY KEY,
    filename  VARCHAR(255) NOT NULL UNIQUE,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );
`;

export async function runMigrations(connectionString) {
  if (!connectionString) {
    throw new Error("runMigrations: connectionString is required");
  }

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    await client.query(CREATE_MIGRATIONS_TABLE);

    const allFiles = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();

    const { rows: applied } = await client.query(
      "SELECT filename FROM schema_migrations ORDER BY filename"
    );
    const appliedSet = new Set(applied.map((r) => r.filename));

    // Bootstrap: tables exist but no migrations recorded.
    if (appliedSet.size === 0) {
      const { rows } = await client.query(`
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'Organizations'
        LIMIT 1
      `);
      if (rows.length > 0) {
        for (const file of allFiles) {
          await client.query(
            "INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING",
            [file]
          );
        }
        console.log(`[migrate] Bootstrapped ${allFiles.length} migration(s) on existing database`);
        return;
      }
    }

    const pending = allFiles.filter((f) => !appliedSet.has(f));
    if (pending.length === 0) {
      console.log("[migrate] No pending migrations");
      return;
    }

    for (const file of pending) {
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      console.log(`[migrate] Applying ${file} ...`);
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
      console.log(`[migrate] Applied ${file}`);
    }

    console.log(`[migrate] ${pending.length} migration(s) applied`);
  } finally {
    await client.end();
  }
}

// Standalone execution: node src/scripts/migrate.js
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { default: dotenv } = await import("dotenv");
  dotenv.config();
  await runMigrations(process.env.DATABASE_URL);
}
