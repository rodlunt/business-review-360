#!/usr/bin/env node
/**
 * Stripe Setup Script
 *
 * This script automatically creates Stripe products and prices for Business Review 360.
 * It creates test mode products that match the pricing plans defined in the platform database.
 *
 * Usage:
 *   node backend/scripts/setup-stripe.js
 *
 * Prerequisites:
 *   - STRIPE_SECRET_KEY environment variable set to your test API key (sk_test_...)
 *   - Or provide it when prompted
 *
 * What this script does:
 *   1. Creates Pro and Enterprise products in Stripe
 *   2. Creates monthly and yearly prices for each product
 *   3. Outputs the Price IDs to add to your .env file
 *   4. Optionally updates the pricing_plans table in br360_platform
 */

import Stripe from 'stripe';
import dotenv from 'dotenv';
import readline from 'readline';
import { platformSequelize } from '../src/models/platformDatabase.js';
import { QueryTypes } from 'sequelize';

// Load environment variables
dotenv.config();

// Pricing configuration
const PRICING_CONFIG = {
  currency: 'aud',
  plans: [
    {
      code: 'pro',
      name: 'Pro',
      description: 'Perfect for growing teams and businesses',
      monthlyPrice: 49.95,
      yearlyPrice: 509.40, // 15% discount
      features: [
        'Up to 40 users',
        'Up to 200 ideas',
        'Advanced analytics',
        'Priority support',
        'Custom branding',
      ],
    },
    {
      code: 'enterprise',
      name: 'Enterprise',
      description: 'For large organizations with advanced needs',
      monthlyPrice: 249.00,
      yearlyPrice: 2539.80, // 15% discount
      features: [
        'Up to 200 users',
        'Up to 1000 ideas',
        'Advanced analytics',
        'Priority support',
        'Custom branding',
        'Dedicated account manager',
        'SLA guarantee',
      ],
    },
  ],
};

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function main() {
  console.log('='.repeat(60));
  console.log('Business Review 360 - Stripe Setup Script');
  console.log('='.repeat(60));
  console.log();

  // Get Stripe API key
  let stripeSecretKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeSecretKey || stripeSecretKey === 'sk_test_placeholder') {
    console.log('STRIPE_SECRET_KEY not found or is a placeholder in .env file.');
    console.log();
    console.log('To get your Stripe test API key:');
    console.log('1. Go to https://dashboard.stripe.com/test/apikeys');
    console.log('2. Make sure you are in TEST mode (toggle in top-right)');
    console.log('3. Copy your "Secret key" (starts with sk_test_)');
    console.log();

    stripeSecretKey = await question('Enter your Stripe test secret key (sk_test_...): ');

    if (!stripeSecretKey || !stripeSecretKey.startsWith('sk_test_')) {
      console.error('❌ Invalid Stripe secret key. Must start with sk_test_');
      rl.close();
      process.exit(1);
    }
  }

  // Initialize Stripe
  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: '2024-12-18.acacia',
  });

  console.log();
  console.log('✅ Connected to Stripe in TEST mode');
  console.log();

  // Confirm action
  console.log('This script will create the following in your Stripe account:');
  console.log();
  for (const plan of PRICING_CONFIG.plans) {
    console.log(`📦 ${plan.name} Plan:`);
    console.log(`   - Monthly: $${plan.monthlyPrice} ${PRICING_CONFIG.currency.toUpperCase()}`);
    console.log(`   - Yearly: $${plan.yearlyPrice} ${PRICING_CONFIG.currency.toUpperCase()}`);
  }
  console.log();

  const confirm = await question('Continue? (yes/no): ');
  if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
    console.log('❌ Setup cancelled');
    rl.close();
    process.exit(0);
  }

  console.log();
  console.log('-'.repeat(60));
  console.log('Creating Stripe Products and Prices...');
  console.log('-'.repeat(60));
  console.log();

  const results = [];

  // Create products and prices
  for (const plan of PRICING_CONFIG.plans) {
    console.log(`Creating ${plan.name} plan...`);

    try {
      // Create product
      const product = await stripe.products.create({
        name: `Business Review 360 - ${plan.name}`,
        description: plan.description,
        metadata: {
          plan_code: plan.code,
          plan_name: plan.name,
        },
      });

      console.log(`  ✅ Product created: ${product.id}`);

      // Create monthly price
      const monthlyPrice = await stripe.prices.create({
        product: product.id,
        currency: PRICING_CONFIG.currency,
        unit_amount: Math.round(plan.monthlyPrice * 100), // Convert to cents
        recurring: {
          interval: 'month',
        },
        metadata: {
          plan_code: plan.code,
          billing_interval: 'monthly',
        },
      });

      console.log(`  ✅ Monthly price created: ${monthlyPrice.id} ($${plan.monthlyPrice}/month)`);

      // Create yearly price
      const yearlyPrice = await stripe.prices.create({
        product: product.id,
        currency: PRICING_CONFIG.currency,
        unit_amount: Math.round(plan.yearlyPrice * 100), // Convert to cents
        recurring: {
          interval: 'year',
        },
        metadata: {
          plan_code: plan.code,
          billing_interval: 'yearly',
        },
      });

      console.log(`  ✅ Yearly price created: ${yearlyPrice.id} ($${plan.yearlyPrice}/year)`);
      console.log();

      results.push({
        planCode: plan.code,
        planName: plan.name,
        productId: product.id,
        monthlyPriceId: monthlyPrice.id,
        yearlyPriceId: yearlyPrice.id,
        monthlyPrice: plan.monthlyPrice,
        yearlyPrice: plan.yearlyPrice,
      });
    } catch (error) {
      console.error(`  ❌ Error creating ${plan.name} plan:`, error.message);
      rl.close();
      process.exit(1);
    }
  }

  console.log();
  console.log('='.repeat(60));
  console.log('✅ Stripe Setup Complete!');
  console.log('='.repeat(60));
  console.log();

  // Display results
  console.log('Add these values to your .env file:');
  console.log();
  console.log('-'.repeat(60));

  for (const result of results) {
    const prefix = result.planCode.toUpperCase();
    console.log(`# ${result.planName} Plan`);
    console.log(`STRIPE_PRICE_${prefix}_MONTH=${result.monthlyPriceId}`);
    console.log(`STRIPE_PRICE_${prefix}_YEAR=${result.yearlyPriceId}`);
    console.log();
  }

  console.log('-'.repeat(60));
  console.log();

  // Ask about updating database
  const updateDb = await question('Would you like to update the pricing_plans table in br360_platform? (yes/no): ');

  if (updateDb.toLowerCase() === 'yes' || updateDb.toLowerCase() === 'y') {
    console.log();
    console.log('Updating pricing_plans table...');

    try {
      // Test database connection
      await platformSequelize.authenticate();
      console.log('✅ Connected to br360_platform database');

      // Update each plan
      for (const result of results) {
        await platformSequelize.query(
          `UPDATE pricing_plans
           SET stripe_monthly_price_id = :monthlyPriceId,
               stripe_yearly_price_id = :yearlyPriceId,
               updated_at = NOW()
           WHERE plan_code = :planCode`,
          {
            replacements: {
              planCode: result.planCode,
              monthlyPriceId: result.monthlyPriceId,
              yearlyPriceId: result.yearlyPriceId,
            },
            type: QueryTypes.UPDATE,
          }
        );

        console.log(`  ✅ Updated ${result.planName} plan in database`);
      }

      console.log();
      console.log('✅ Database updated successfully!');
    } catch (error) {
      console.error('❌ Error updating database:', error.message);
      console.log();
      console.log('You can manually update the pricing_plans table later.');
    }
  }

  console.log();
  console.log('='.repeat(60));
  console.log('Next Steps:');
  console.log('='.repeat(60));
  console.log('1. Copy the price IDs above to your .env file');
  console.log('2. Get your webhook secret:');
  console.log('   - For local testing: Install Stripe CLI and run:');
  console.log('     stripe listen --forward-to localhost:4000/api/billing/webhook');
  console.log('   - For production: Configure webhook in Stripe Dashboard');
  console.log('3. Add STRIPE_WEBHOOK_SECRET to your .env file');
  console.log('4. Restart your backend server');
  console.log('5. Test the checkout flow!');
  console.log('='.repeat(60));
  console.log();

  rl.close();
  process.exit(0);
}

// Run the script
main().catch((error) => {
  console.error('❌ Fatal error:', error);
  rl.close();
  process.exit(1);
});
