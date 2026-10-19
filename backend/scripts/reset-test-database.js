#!/usr/bin/env node
/**
 * CLI wrapper around resetTestDatabase(). Use for local dev when you want to
 * wipe tenant data without running the HTTP shim. Refuses to run when
 * NODE_ENV=production or when ALLOW_DESTRUCTIVE_TEST_ENDPOINTS is not "true".
 *
 * Issue #544.
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to run reset-test-database.js with NODE_ENV=production.");
  process.exit(1);
}

if (process.env.ALLOW_DESTRUCTIVE_TEST_ENDPOINTS !== "true") {
  console.error(
    "Refusing to run: set ALLOW_DESTRUCTIVE_TEST_ENDPOINTS=true to enable destructive test fixtures."
  );
  process.exit(1);
}

const { resetTestDatabase } = await import("../src/lib/resetTestDatabase.js");

try {
  await resetTestDatabase();
  console.log("Test database wiped.");
  process.exit(0);
} catch (err) {
  console.error("reset-test-database failed:", err.message);
  process.exit(1);
}
