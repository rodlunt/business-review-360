/**
 * Jest setup file -- runs once per worker BEFORE any test module is resolved.
 * Wired via `setupFiles` in backend/package.json.
 *
 * Issue #593: backend Jest runs were inheriting the entire production-style
 * root `.env` (DATABASE_URL pointing at the docker-compose hostname `db`,
 * live Resend keys, real JWT secret, Stripe keys when not commented out, etc).
 * Any test that imported a route, model, or middleware transitively triggered
 * `dotenv.config()` calls inside `models/database.js` and `models/platformDatabase.js`.
 *
 * This file is the single source of truth for test env. It:
 *   1. Forces NODE_ENV=test before any model module loads.
 *   2. Loads backend/.env.test (committed dummies) without overriding any
 *      value already set by the test runner or shell.
 *   3. Asserts DATABASE_URL is either sqlite::memory: or a localhost Postgres
 *      URL. A prod-shaped URL (e.g. user@db:5432/...) aborts the run loudly.
 *
 * The NODE_ENV=test signal is also what the model modules check before
 * deciding whether to load the production `.env`. See:
 *   - backend/src/index.js
 *   - backend/src/models/database.js
 *   - backend/src/models/platformDatabase.js
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { redactDatabaseUrl } from './src/utils/redactDatabaseUrl.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Force NODE_ENV=test unconditionally. This protects against an outer shell
//    that exported NODE_ENV=production (or anything else) before invoking jest.
process.env.NODE_ENV = 'test';

// 2. Load backend/.env.test. `override: false` means values already set by the
//    test runner or shell win. dotenv.config silently ignores a missing file
//    (returns { error }); the assertions below catch that case loudly.
const envTestPath = path.resolve(__dirname, '.env.test');
dotenv.config({ path: envTestPath, override: false });

// 3. Assert no prod-shaped DATABASE_URL leaked through. The regex permits
//    sqlite::memory:, localhost, or 127.0.0.1; everything else is rejected.
//    #591 (pg testcontainer harness) will extend this to host.docker.internal
//    if the integration test layer ever needs it.
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    [
      '[jest.setup] DATABASE_URL not set after loading backend/.env.test.',
      `Make sure ${envTestPath} is committed and contains a DATABASE_URL line.`,
      'See docs/superpowers/specs/2026-04-26-593-env-leak-test-isolation-design.md',
    ].join('\n')
  );
}

const SAFE_DATABASE_URL_REGEX =
  /^(sqlite::memory:|sqlite::memory:\?cache=shared|sqlite:[^:]|postgres:\/\/[^@]+@(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$)/;

if (!SAFE_DATABASE_URL_REGEX.test(databaseUrl)) {
  throw new Error(
    [
      '[jest.setup] DATABASE_URL points at a non-local host. Refusing to run',
      'tests against a prod-shaped database. Override with',
      '`DATABASE_URL=sqlite::memory:` or a localhost testcontainer URL.',
      `Offending value: ${redactDatabaseUrl(databaseUrl)}`,
      'See docs/superpowers/specs/2026-04-26-593-env-leak-test-isolation-design.md',
    ].join('\n')
  );
}
