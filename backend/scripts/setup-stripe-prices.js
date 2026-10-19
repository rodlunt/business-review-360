/**
 * Setup Stripe Products and Prices for Business Review 360
 *
 * This script creates products and prices in Stripe for our pricing plans.
 * Run this once to set up your Stripe account.
 *
 * Usage: node scripts/setup-stripe-prices.js
 */

import dotenv from 'dotenv';
import Stripe from 'stripe';
import { Sequelize, QueryTypes } from 'sequelize';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Connect to platform database
const platformSequelize = new Sequelize(process.env.PLATFORM_DATABASE_URL, {
  logging: false,
  dialectOptions: {
    connectTimeout: 60000,
  },
});

async function setupStripeProducts() {
  console.log('🚀 Starting Stripe product and price setup...\n');

  try {
    // Fetch pricing plans from database
    const plans = await platformSequelize.query(
      'SELECT * FROM pricing_plans WHERE plan_code IN (:codes) ORDER BY monthly_price',
      {
        replacements: { codes: ['free', 'pro', 'enterprise'] },
        type: QueryTypes.SELECT,
      }
    );

    console.log(`Found ${plans.length} plans to configure:\n`);

    for (const plan of plans) {
      console.log(`📦 Setting up: ${plan.plan_name} (${plan.plan_code})`);
      console.log(`   Monthly: $${(plan.monthly_price / 100).toFixed(2)} AUD`);
      console.log(`   Yearly: $${(plan.yearly_price / 100).toFixed(2)} AUD`);

      // Create or retrieve Stripe Product
      let product;
      try {
        // Search for existing product
        const products = await stripe.products.search({
          query: `name:'Business Review 360 - ${plan.plan_name}'`,
        });

        if (products.data.length > 0) {
          product = products.data[0];
          console.log(`   ✅ Found existing product: ${product.id}`);
        } else {
          // Create new product
          product = await stripe.products.create({
            name: `Business Review 360 - ${plan.plan_name}`,
            description: plan.description,
            metadata: {
              plan_code: plan.plan_code,
              max_ideas: plan.limits.maxIdeas,
              max_users: plan.limits.maxUsers,
              max_storage: plan.limits.maxStorage,
            },
          });
          console.log(`   ✅ Created product: ${product.id}`);
        }
      } catch (error) {
        console.error(`   ❌ Error with product: ${error.message}`);
        continue;
      }

      // Create monthly price
      let monthlyPrice;
      try {
        const monthlyPrices = await stripe.prices.list({
          product: product.id,
          recurring: { interval: 'month' },
          active: true,
        });

        if (monthlyPrices.data.length > 0) {
          monthlyPrice = monthlyPrices.data[0];
          console.log(`   ✅ Found monthly price: ${monthlyPrice.id}`);
        } else {
          monthlyPrice = await stripe.prices.create({
            product: product.id,
            unit_amount: plan.monthly_price,
            currency: 'aud',
            recurring: {
              interval: 'month',
            },
            metadata: {
              plan_code: plan.plan_code,
              interval: 'monthly',
            },
          });
          console.log(`   ✅ Created monthly price: ${monthlyPrice.id}`);
        }
      } catch (error) {
        console.error(`   ❌ Error with monthly price: ${error.message}`);
      }

      // Create yearly price
      let yearlyPrice;
      try {
        const yearlyPrices = await stripe.prices.list({
          product: product.id,
          recurring: { interval: 'year' },
          active: true,
        });

        if (yearlyPrices.data.length > 0) {
          yearlyPrice = yearlyPrices.data[0];
          console.log(`   ✅ Found yearly price: ${yearlyPrice.id}`);
        } else {
          yearlyPrice = await stripe.prices.create({
            product: product.id,
            unit_amount: plan.yearly_price,
            currency: 'aud',
            recurring: {
              interval: 'year',
            },
            metadata: {
              plan_code: plan.plan_code,
              interval: 'yearly',
            },
          });
          console.log(`   ✅ Created yearly price: ${yearlyPrice.id}`);
        }
      } catch (error) {
        console.error(`   ❌ Error with yearly price: ${error.message}`);
      }

      // Update database with Stripe IDs
      if (monthlyPrice && yearlyPrice) {
        await platformSequelize.query(
          'UPDATE pricing_plans SET stripe_monthly_price_id = :monthlyId, stripe_yearly_price_id = :yearlyId WHERE plan_code = :planCode',
          {
            replacements: {
              monthlyId: monthlyPrice.id,
              yearlyId: yearlyPrice.id,
              planCode: plan.plan_code,
            },
            type: QueryTypes.UPDATE,
          }
        );
        console.log(`   ✅ Updated database with Stripe price IDs\n`);
      }
    }

    // Display summary
    console.log('\n📊 SUMMARY - Updated pricing plans:');
    const updatedPlans = await platformSequelize.query(
      'SELECT plan_code, plan_name, stripe_monthly_price_id, stripe_yearly_price_id FROM pricing_plans WHERE plan_code IN (:codes) ORDER BY monthly_price',
      {
        replacements: { codes: ['free', 'pro', 'enterprise'] },
        type: QueryTypes.SELECT,
      }
    );

    console.table(updatedPlans);

    console.log('\n✅ Stripe setup complete!');
    console.log('\nNext steps:');
    console.log('1. Verify products in Stripe Dashboard: https://dashboard.stripe.com/test/products');
    console.log('2. Test checkout flow in your application');
    console.log('3. Configure webhooks for production deployment\n');

  } catch (error) {
    console.error('❌ Error during setup:', error.message);
    console.error(error);
  } finally {
    await platformSequelize.close();
    process.exit(0);
  }
}

setupStripeProducts();
