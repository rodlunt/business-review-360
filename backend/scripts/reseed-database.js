/**
 * Database Reseed Script
 * Runs the clean_test_data.sql to reset and reseed the database
 */
import { Sequelize } from 'sequelize';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function reseedDatabase() {
  console.log('Starting database reseed...');

  const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
  });

  const platformSequelize = new Sequelize(process.env.PLATFORM_DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
  });

  try {
    // Test connection
    await sequelize.authenticate();
    console.log('✅ Connected to app database');

    await platformSequelize.authenticate();
    console.log('✅ Connected to platform database');

    // Read and run the platform schema (contains tenant data)
    const platformSchemaPath = path.resolve(__dirname, '../../db/platform_schema.sql');
    const platformSchema = fs.readFileSync(platformSchemaPath, 'utf8');

    console.log('Running platform schema...');
    // Split by semicolons and run each statement
    const platformStatements = platformSchema
      .split(/;\s*$/m)
      .filter(s => s.trim() && !s.trim().startsWith('--'));

    for (const stmt of platformStatements) {
      if (stmt.trim()) {
        try {
          await platformSequelize.query(stmt + ';');
        } catch (err) {
          // Ignore errors for CREATE TABLE IF NOT EXISTS conflicts
          if (!err.message.includes('already exists') && !err.message.includes('duplicate key')) {
            console.log('Platform statement warning:', err.message.substring(0, 100));
          }
        }
      }
    }
    console.log('✅ Platform schema complete');

    // Read and run the clean test data
    const testDataPath = path.resolve(__dirname, '../../db/clean_test_data.sql');
    const testData = fs.readFileSync(testDataPath, 'utf8');

    console.log('Running test data seed...');
    // Split by semicolons and run each statement
    const statements = testData
      .split(/;\s*$/m)
      .filter(s => s.trim() && !s.trim().startsWith('--'));

    for (const stmt of statements) {
      if (stmt.trim()) {
        try {
          await sequelize.query(stmt + ';');
        } catch (err) {
          // Log but continue on non-critical errors
          if (!err.message.includes('duplicate key') && !err.message.includes('already exists')) {
            console.log('Statement warning:', err.message.substring(0, 100));
          }
        }
      }
    }
    console.log('✅ Test data seeded successfully');

    // Verify dcuser has correct tenant_id
    const [users] = await sequelize.query(`
      SELECT id, username, "organizationId", tenant_id
      FROM "Users"
      WHERE username IN ('dcuser', 'dcadmin')
    `);

    console.log('\n📋 Demo Corp users:');
    users.forEach(u => {
      console.log(`  ${u.username}: org=${u.organizationId}, tenant_id=${u.tenant_id}`);
    });

    // Verify tenant exists in platform DB
    const [tenants] = await platformSequelize.query(`
      SELECT id, org_id, tenant_name, status
      FROM tenants
      WHERE org_id = 'demo-corp'
    `);

    console.log('\n📋 Demo Corp tenant in platform DB:');
    tenants.forEach(t => {
      console.log(`  ${t.org_id}: id=${t.id}, name=${t.tenant_name}, status=${t.status}`);
    });

    console.log('\n✅ Database reseed complete!');
  } catch (error) {
    console.error('❌ Error reseeding database:', error.message);
    process.exit(1);
  } finally {
    await sequelize.close();
    await platformSequelize.close();
  }
}

reseedDatabase();
