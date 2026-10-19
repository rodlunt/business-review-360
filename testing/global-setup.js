/**
 * Playwright Global Setup
 *
 * Runs once before all tests to ensure the local Docker database is seeded
 * with the permanent test fixtures used across the E2E suite.
 *
 * Databases:
 *   br360_platform     — tenants table (queried by tenantResolver middleware)
 *   business_review_db — Organizations, Users, Ideas, etc.
 *
 * Fixtures applied:
 *   demo-corp org + dcuser/dcadmin    (seed-data.sql + seed-test-platform.sql)
 *   dcsuper (superuser)               (db/patches/dcsuper-seed.sql)
 *   test-org-2 + testorg2admin/user   (db/patches/test-org-2-seed.sql)
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { config as dotenvConfig } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load root .env so POSTGRES_USER is available (docker-compose reads the same file)
dotenvConfig({ path: path.resolve(__dirname, '..', '.env') });

const DB_CONTAINER = 'business-review-360-db-1';
const BACKEND_CONTAINER = 'business-review-360-backend-1';
const DB_USER = process.env.POSTGRES_USER || 'business_review_user';
const PLATFORM_DB = 'br360_platform';
const APP_DB = 'business_review_db';

function psql(database, sqlFile) {
  return `cat "${sqlFile}" | docker exec -i ${DB_CONTAINER} psql -U ${DB_USER} -d ${database}`;
}

function psqlSed(database, sqlFile, sedPattern) {
  return `sed -n '${sedPattern}' "${sqlFile}" | docker exec -i ${DB_CONTAINER} psql -U ${DB_USER} -d ${database}`;
}

function queryCount(database, query) {
  // Pipe query via stdin to avoid shell-quoting issues with double-quoted identifiers (e.g. "Users")
  return execSync(
    `docker exec -i ${DB_CONTAINER} psql -U ${DB_USER} -d ${database} -tA`,
    { encoding: 'utf-8', input: query }
  ).trim();
}

async function globalSetup() {
  console.log('\n Setting up test environment...\n');

  try {
    // -------------------------------------------------------------------------
    // 1. Seed platform DB with demo-corp tenant
    // -------------------------------------------------------------------------
    console.log('Seeding platform database with demo-corp tenant...');
    const platformSqlFile = path.join(__dirname, '..', 'db', 'seed-test-platform.sql');
    try {
      execSync(psql(PLATFORM_DB, platformSqlFile), { stdio: 'inherit' });
      console.log('  Platform database seeded');
    } catch (err) {
      console.log('  Warning: Platform database seeding failed (may already exist):', err.message);
    }

    // -------------------------------------------------------------------------
    // 2. Seed app DB with demo-corp org, dcuser, dcadmin
    // -------------------------------------------------------------------------
    console.log('Seeding app database with demo-corp org and users...');
    const appSqlFile = path.join(__dirname, '..', 'db', 'seed-data.sql');
    try {
      execSync(psql(APP_DB, appSqlFile), { stdio: 'inherit' });
      console.log('  App database seeded');
    } catch (err) {
      console.log('  Warning: App database seeding failed:', err.message);
    }

    // -------------------------------------------------------------------------
    // 3. Seed dcsuper fixture (app DB only)
    // -------------------------------------------------------------------------
    console.log('Applying dcsuper fixture...');
    const dcsuperSqlFile = path.join(__dirname, '..', 'db', 'patches', 'dcsuper-seed.sql');
    try {
      execSync(psql(APP_DB, dcsuperSqlFile), { stdio: 'inherit' });
      console.log('  dcsuper seeded');
    } catch (err) {
      console.log('  Warning: dcsuper seed failed:', err.message);
    }

    // -------------------------------------------------------------------------
    // 4. Seed test-org-2 fixture (platform DB section, then app DB section)
    // -------------------------------------------------------------------------
    console.log('Applying test-org-2 fixture...');
    const testOrg2SqlFile = path.join(__dirname, '..', 'db', 'patches', 'test-org-2-seed.sql');
    try {
      // Platform section first (tenants row)
      execSync(
        psqlSed(PLATFORM_DB, testOrg2SqlFile, '/-- PLATFORM DB START/,/-- PLATFORM DB END/p'),
        { stdio: 'inherit' }
      );
      console.log('  test-org-2 platform tenant seeded');

      // App section second (Organizations + Users rows)
      execSync(
        psqlSed(APP_DB, testOrg2SqlFile, '/-- APP DB START/,/-- APP DB END/p'),
        { stdio: 'inherit' }
      );
      console.log('  test-org-2 org and users seeded');
    } catch (err) {
      console.log('  Warning: test-org-2 seed failed:', err.message);
    }

    // -------------------------------------------------------------------------
    // 4b. Configure test orgs for E2E headless browser compatibility:
    //   - useCaptcha=false  → reCAPTCHA not sent; headless Chrome fails Google's score
    //   - setupWizardCompleted=true → wizard dialog does not block admin menu clicks
    // -------------------------------------------------------------------------
    console.log('Configuring test orgs for E2E compatibility...');
    try {
      execSync(
        `docker exec -i ${DB_CONTAINER} psql -U ${DB_USER} -d ${APP_DB} -tA`,
        {
          encoding: 'utf-8',
          input: `UPDATE "Organizations"
                  SET "useCaptcha" = false, "setupWizardCompleted" = true
                  WHERE "organizationId" IN ('demo-corp', 'test-org-2');`,
        }
      );
      console.log('  useCaptcha=false, setupWizardCompleted=true set for demo-corp and test-org-2');
    } catch (err) {
      console.log('  Warning: Could not configure test orgs:', err.message);
    }

    // -------------------------------------------------------------------------
    // 4c. Seed the Phase 5 5c canonical login identities (#867).
    //   multiorg@e2e.local  - approved in demo-corp + test-org-2 (picker)
    //   singleorg@e2e.local - approved in demo-corp only (no picker)
    //   consultant@e2e.local - approved in demo-corp; Persona 1 injects an
    //                          activation token onto this row at test time
    //   App-DB only; both orgs were seeded above. Idempotent.
    // -------------------------------------------------------------------------
    console.log('Applying Phase 5 5c canonical login identities...');
    const multiOrgSqlFile = path.join(__dirname, '..', 'db', 'patches', 'multi-org-user-seed.sql');
    try {
      execSync(
        psqlSed(APP_DB, multiOrgSqlFile, '/-- APP DB START/,/-- APP DB END/p'),
        { stdio: 'inherit' }
      );
      console.log('  5c canonical login identities seeded');
    } catch (err) {
      console.log('  Warning: 5c canonical login identity seed failed:', err.message);
    }

    // -------------------------------------------------------------------------
    // 5. Restart backend to clear in-memory tenant cache for new tenants
    //    (no-op if the container is not running or is named differently)
    // -------------------------------------------------------------------------
    console.log('Restarting backend to clear tenant cache...');
    try {
      execSync(`docker restart ${BACKEND_CONTAINER}`, { stdio: 'pipe' });
      // Wait for the backend to be ready (health endpoint)
      execSync('sleep 8', { stdio: 'pipe' });
      console.log('  Backend restarted');
    } catch {
      console.log('  Warning: Could not restart backend container — tenant cache may be stale');
    }

    // -------------------------------------------------------------------------
    // 6. Verify all required fixtures exist
    // -------------------------------------------------------------------------
    console.log('Verifying test fixtures...');

    const usersToCheck = [
      { username: 'dcuser',        db: APP_DB },
      { username: 'dcadmin',       db: APP_DB },
      { username: 'dcsuper',       db: APP_DB },
      { username: 'testorg2admin', db: APP_DB },
      { username: 'testorg2user',  db: APP_DB },
      { username: 'multiorg@e2e.local',   db: APP_DB },
      { username: 'singleorg@e2e.local',  db: APP_DB },
      { username: 'consultant@e2e.local', db: APP_DB },
    ];

    for (const { username, db } of usersToCheck) {
      const count = queryCount(db, `SELECT COUNT(*) FROM "Users" WHERE username='${username}';`);
      if (count === '1') {
        console.log(`  ${username} exists`);
      } else {
        console.log(`  Warning: ${username} not found (count=${count})`);
      }
    }

    // The multi-org persona depends on multiorg@e2e.local resolving to
    // exactly 2 approved memberships (count !== 2 => wrong persona path).
    try {
      const memCount = queryCount(
        APP_DB,
        `SELECT COUNT(*) FROM "UserOrganizationMemberships" ` +
        `WHERE "userId"='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND "isApproved"=true;`
      );
      if (memCount === '2') {
        console.log('  multiorg@e2e.local has 2 approved memberships');
      } else {
        console.log(`  Warning: multiorg@e2e.local approved membership count=${memCount} (expected 2)`);
      }
    } catch (err) {
      console.log('  Warning: Could not verify multi-org memberships:', err.message);
    }

    // Verify test-org-2 tenant in platform DB
    try {
      const tenantCount = queryCount(
        PLATFORM_DB,
        "SELECT COUNT(*) FROM tenants WHERE org_id='test-org-2';"
      );
      if (tenantCount === '1') {
        console.log('  test-org-2 tenant exists in platform DB');
      } else {
        console.log(`  Warning: test-org-2 tenant not found in platform DB (count=${tenantCount})`);
      }
    } catch (err) {
      console.log('  Warning: Could not verify platform tenant:', err.message);
    }

    console.log('\n Test environment setup complete!\n');
  } catch (error) {
    console.error('Global setup failed:', error.message);
    throw error;
  }
}

export default globalSetup;
