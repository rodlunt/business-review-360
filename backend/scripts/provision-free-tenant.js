/**
 * Manually provision a free tenant (bypasses Stripe)
 *
 * Usage:
 *   node backend/scripts/provision-free-tenant.js <org-id> <tenant-name> <plan> [admin-email]
 *
 * Examples:
 *   node backend/scripts/provision-free-tenant.js acme-corp "Acme Corporation" sme admin@acme.com
 *   node backend/scripts/provision-free-tenant.js beta-user "Beta User Inc" pro
 *
 * Plans: sme, pro, enterprise
 */

import { platformSequelize } from '../src/models/platformDatabase.js';
import { sequelize as appSequelize } from '../src/models/database.js';
import Organization from '../src/models/Organization.js';
import { QueryTypes } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const PLAN_LIMITS = {
  sme: { maxIdeas: 25, maxUsers: 5, maxStorage: 524288000 },        // 500MB
  pro: { maxIdeas: 500, maxUsers: 50, maxStorage: 5368709120 },     // 5GB
  enterprise: { maxIdeas: -1, maxUsers: 1000, maxStorage: 1099511627776 }, // 1TB, unlimited ideas
};

async function provisionFreeTenant(orgId, tenantName, plan, adminEmail) {
  console.log('\n🚀 Provisioning Free Tenant\n');
  console.log('  Org ID:', orgId);
  console.log('  Name:', tenantName);
  console.log('  Plan:', plan);
  console.log('  Admin:', adminEmail || 'Not specified');
  console.log('');

  // Validate plan
  if (!PLAN_LIMITS[plan]) {
    console.error('❌ Invalid plan. Must be one of: sme, pro, enterprise');
    process.exit(1);
  }

  try {
    // Check if org already exists
    const existing = await platformSequelize.query(
      'SELECT id, org_id FROM tenants WHERE org_id = :orgId',
      { replacements: { orgId }, type: QueryTypes.SELECT }
    );

    if (existing.length > 0) {
      console.error('❌ Organization ID already exists:', orgId);
      process.exit(1);
    }

    // Create tenant
    await platformSequelize.query(
      `INSERT INTO tenants (org_id, tenant_name, plan, status, limits, created_at, updated_at, activated_at)
       VALUES (:orgId, :tenantName, :plan, 'active', :limits, NOW(), NOW(), NOW())`,
      {
        replacements: {
          orgId,
          tenantName,
          plan,
          limits: JSON.stringify(PLAN_LIMITS[plan]),
        },
        type: QueryTypes.INSERT,
      }
    );

    console.log('✅ Tenant created in platform database!\n');

    // Get the created tenant
    const tenant = await platformSequelize.query(
      'SELECT id, org_id, tenant_name, plan, status, limits FROM tenants WHERE org_id = :orgId',
      { replacements: { orgId }, type: QueryTypes.SELECT }
    );

    console.log('Tenant Details:');
    console.log('  ID:', tenant[0].id);
    console.log('  Org ID:', tenant[0].org_id);
    console.log('  Name:', tenant[0].tenant_name);
    console.log('  Plan:', tenant[0].plan);
    console.log('  Status:', tenant[0].status);
    console.log('  Limits:', JSON.stringify(tenant[0].limits));

    // Create Organization in app database
    console.log('\n📦 Creating Organization in app database...');

    const existingOrg = await Organization.findOne({
      where: { organizationId: orgId }
    });

    if (!existingOrg) {
      await Organization.create({
        organizationId: orgId,
        organizationName: tenantName,
        organizationDescription: `Welcome to ${tenantName}`,
        primaryColor: '#1565c0',
        useCaptcha: true,
        allowAnonymousIdeas: false,
        requireApproval: true,
        enablePwaPrompt: false,
        allowSelfRegistration: true,
        domainRestrictionMode: 'none',
        allowedDomains: [],
        blockedDomains: [],
      });
      console.log('✅ Organization created in app database!\n');
    } else {
      console.log('⚠️  Organization already exists in app database\n');
    }

    console.log('📝 Next Steps:');
    console.log('  1. The user can now access: /org/' + orgId);
    console.log('  2. They need to create their admin account on first visit');
    if (adminEmail) {
      console.log('  3. Send setup instructions to:', adminEmail);
    }
    console.log('\n⚠️  Note: This tenant has no Stripe subscription.');
    console.log('  They will not be able to use the Customer Portal for billing.');
    console.log('  To add Stripe later, create a subscription manually in Stripe Dashboard.\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await platformSequelize.close();
    await appSequelize.close();
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length < 3) {
  console.log('Usage: node provision-free-tenant.js <org-id> <tenant-name> <plan> [admin-email]');
  console.log('');
  console.log('Plans: sme, pro, enterprise');
  console.log('');
  console.log('Example:');
  console.log('  node provision-free-tenant.js acme-corp "Acme Corporation" pro admin@acme.com');
  process.exit(1);
}

const [orgId, tenantName, plan, adminEmail] = args;

provisionFreeTenant(orgId, tenantName, plan, adminEmail);
