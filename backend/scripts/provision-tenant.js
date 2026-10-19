/**
 * Manual Tenant Provisioning Script
 *
 * This script manually provisions a tenant for local development testing
 * when webhooks can't reach localhost.
 *
 * Usage: node backend/scripts/provision-tenant.js <orgId> <planId>
 * Example: node backend/scripts/provision-tenant.js test-org-final pro
 */

import { platformSequelize } from '../src/models/platformDatabase.js';
import { QueryTypes, Sequelize } from 'sequelize';

async function provisionTenant(orgId, planId = 'pro') {
  try {
    console.log(`\n[Provisioning] Starting tenant provisioning for: ${orgId}`);
    console.log(`[Provisioning] Plan: ${planId}`);

    // 1. Check if tenant already exists
    const existingTenant = await platformSequelize.query(
      'SELECT id, org_id FROM tenants WHERE org_id = :orgId',
      {
        replacements: { orgId },
        type: QueryTypes.SELECT,
      }
    );

    if (existingTenant.length > 0) {
      console.log(`[Provisioning] ✓ Tenant already exists: ${orgId}`);
      const tenantId = existingTenant[0].id;

      // Check if database exists
      const dbName = `tenant_${orgId}`;
      try {
        const testQuery = await platformSequelize.query(
          `SELECT 1 FROM pg_database WHERE datname = :dbName`,
          {
            replacements: { dbName },
            type: QueryTypes.SELECT,
          }
        );

        if (testQuery.length > 0) {
          console.log(`[Provisioning] ✓ Database already exists: ${dbName}`);
        }
      } catch (err) {
        console.error(`[Provisioning] Error checking database:`, err.message);
      }

      return tenantId;
    }

    // 2. Get plan limits
    const plan = await platformSequelize.query(
      'SELECT limits, plan_name FROM pricing_plans WHERE plan_code = :planId',
      {
        replacements: { planId },
        type: QueryTypes.SELECT,
      }
    );

    if (plan.length === 0) {
      throw new Error(`Plan not found: ${planId}`);
    }

    const planLimits = plan[0].limits;
    console.log(`[Provisioning] Plan limits:`, planLimits);

    // 3. Create tenant record
    const tenantName = orgId.split('-').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');

    const result = await platformSequelize.query(
      `INSERT INTO tenants (org_id, tenant_name, plan, limits, status, created_at, updated_at)
       VALUES (:orgId, :tenantName, :planId, :limits, 'active', NOW(), NOW())
       RETURNING id, org_id, tenant_name, plan, status`,
      {
        replacements: {
          orgId,
          tenantName,
          planId,
          limits: JSON.stringify(planLimits),
        },
        type: QueryTypes.INSERT,
      }
    );

    const tenantId = result[0][0].id;
    console.log(`[Provisioning] ✓ Created tenant record:`, result[0][0]);

    // 4. Create tenant database
    const dbName = `tenant_${orgId}`;
    console.log(`[Provisioning] Creating database: ${dbName}`);

    try {
      // Check if database already exists
      const existingDb = await platformSequelize.query(
        `SELECT 1 FROM pg_database WHERE datname = :dbName`,
        {
          replacements: { dbName },
          type: QueryTypes.SELECT,
        }
      );

      if (existingDb.length === 0) {
        await platformSequelize.query(
          `CREATE DATABASE "${dbName}" WITH OWNER = business_review_user ENCODING = 'UTF8'`,
          { type: QueryTypes.RAW }
        );
        console.log(`[Provisioning] ✓ Created database: ${dbName}`);
      } else {
        console.log(`[Provisioning] ✓ Database already exists: ${dbName}`);
      }
    } catch (err) {
      console.error(`[Provisioning] Error creating database:`, err.message);
      // Continue anyway - database might already exist
    }

    // 5. Initialize tenant database schema
    console.log(`[Provisioning] Initializing database schema...`);

    const dbConnectionString = `postgres://business_review_user:business_review_pass@localhost:5432/${dbName}`;
    const tenantDb = new Sequelize(dbConnectionString, {
      logging: false,
    });

    try {
      // Create basic schema (simplified for testing)
      await tenantDb.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(255) UNIQUE NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          "isSuperuser" BOOLEAN DEFAULT false,
          "createdAt" TIMESTAMP DEFAULT NOW(),
          "updatedAt" TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS categories (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          "createdAt" TIMESTAMP DEFAULT NOW(),
          "updatedAt" TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS ideas (
          id SERIAL PRIMARY KEY,
          title VARCHAR(500) NOT NULL,
          description TEXT,
          "userId" INTEGER REFERENCES users(id),
          "categoryId" INTEGER REFERENCES categories(id),
          status VARCHAR(50) DEFAULT 'pending',
          "createdAt" TIMESTAMP DEFAULT NOW(),
          "updatedAt" TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS settings (
          id SERIAL PRIMARY KEY,
          "organizationId" VARCHAR(255) NOT NULL,
          "organizationName" VARCHAR(255),
          "organizationDescription" TEXT,
          "primaryColor" VARCHAR(50),
          "logoUrl" TEXT,
          "createdAt" TIMESTAMP DEFAULT NOW(),
          "updatedAt" TIMESTAMP DEFAULT NOW()
        );
      `);

      // Insert default settings
      await tenantDb.query(`
        INSERT INTO settings ("organizationId", "organizationName", "organizationDescription", "primaryColor", "createdAt", "updatedAt")
        VALUES (:orgId, :tenantName, 'Business Review 360 for ' || :tenantName, '#00A6BC', NOW(), NOW())
        ON CONFLICT DO NOTHING
      `, {
        replacements: { orgId, tenantName },
        type: QueryTypes.INSERT,
      });

      console.log(`[Provisioning] ✓ Initialized database schema`);

      await tenantDb.close();
    } catch (err) {
      console.error(`[Provisioning] Error initializing schema:`, err.message);
      try {
        await tenantDb.close();
      } catch (e) {}
    }

    console.log(`\n[Provisioning] ✅ SUCCESS! Tenant provisioned: ${orgId}`);
    console.log(`[Provisioning] Tenant ID: ${tenantId}`);
    console.log(`[Provisioning] Database: ${dbName}`);
    console.log(`\n[Provisioning] Next steps:`);
    console.log(`  1. Go to: http://localhost:3000/org/${orgId}/setup/superuser`);
    console.log(`  2. Create your admin account`);
    console.log(`  3. Login and start using the application\n`);

    return tenantId;

  } catch (error) {
    console.error('\n[Provisioning] ❌ ERROR:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    await platformSequelize.close();
  }
}

// Run from command line
const orgId = process.argv[2];
const planId = process.argv[3] || 'pro';

if (!orgId) {
  console.error('Usage: node provision-tenant.js <orgId> [planId]');
  console.error('Example: node provision-tenant.js test-org-final pro');
  process.exit(1);
}

provisionTenant(orgId, planId)
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Failed:', err.message);
    process.exit(1);
  });

export { provisionTenant };
