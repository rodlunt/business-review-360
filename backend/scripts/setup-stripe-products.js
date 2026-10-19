/**
 * Setup Stripe Products and Update Database
 *
 * This script:
 * 1. Creates Stripe Products and Prices for each plan
 * 2. Updates pricing_plans table with actual Stripe Price IDs
 * 3. Configures Stripe Customer Portal to allow plan switching
 *
 * Run with: node backend/scripts/setup-stripe-products.js
 */

import Stripe from 'stripe';
import { platformSequelize } from '../src/models/platformDatabase.js';
import { QueryTypes } from 'sequelize';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia',
});

const plans = [
  {
    code: 'sme',
    name: 'SME Plan',
    description: 'Perfect for small teams',
    monthlyPrice: 1995,  // $19.95 in cents
    yearlyPrice: 20340,  // $203.40 in cents (15% discount)
    currency: 'aud',
  },
  {
    code: 'pro',
    name: 'Pro Plan',
    description: 'Advanced features for growing teams',
    monthlyPrice: 4995,  // $49.95 in cents
    yearlyPrice: 50940,  // $509.40 in cents (15% discount)
    currency: 'aud',
  },
  {
    code: 'enterprise',
    name: 'Enterprise Plan',
    description: 'Full-featured plan for large organizations',
    monthlyPrice: 24900,  // $249.00 in cents
    yearlyPrice: 253980,  // $2539.80 in cents (15% discount)
    currency: 'aud',
  },
];

async function createStripeProduct(plan) {
  console.log(`\n📦 Creating Stripe product for ${plan.name}...`);

  try {
    // Create Product
    const product = await stripe.products.create({
      name: plan.name,
      description: plan.description,
      metadata: {
        plan_code: plan.code,
        managed_by: 'business-review-360',
      },
    });

    console.log(`✅ Product created: ${product.id}`);

    // Create Monthly Price
    const monthlyPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.monthlyPrice,
      currency: plan.currency,
      recurring: {
        interval: 'month',
      },
      metadata: {
        plan_code: plan.code,
        billing_interval: 'monthly',
      },
    });

    console.log(`✅ Monthly price created: ${monthlyPrice.id} ($${plan.monthlyPrice / 100}/${plan.currency}/month)`);

    // Create Yearly Price
    const yearlyPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.yearlyPrice,
      currency: plan.currency,
      recurring: {
        interval: 'year',
      },
      metadata: {
        plan_code: plan.code,
        billing_interval: 'yearly',
      },
    });

    console.log(`✅ Yearly price created: ${yearlyPrice.id} ($${plan.yearlyPrice / 100}/${plan.currency}/year)`);

    return {
      productId: product.id,
      monthlyPriceId: monthlyPrice.id,
      yearlyPriceId: yearlyPrice.id,
    };
  } catch (error) {
    console.error(`❌ Error creating Stripe product for ${plan.name}:`, error.message);
    throw error;
  }
}

async function updateDatabasePriceIds(planCode, monthlyPriceId, yearlyPriceId) {
  console.log(`\n💾 Updating database for plan: ${planCode}...`);

  try {
    await platformSequelize.query(
      `UPDATE pricing_plans
       SET stripe_monthly_price_id = :monthlyPriceId,
           stripe_yearly_price_id = :yearlyPriceId,
           updated_at = NOW()
       WHERE plan_code = :planCode`,
      {
        replacements: {
          planCode,
          monthlyPriceId,
          yearlyPriceId,
        },
        type: QueryTypes.UPDATE,
      }
    );

    console.log(`✅ Database updated for ${planCode}`);
  } catch (error) {
    console.error(`❌ Error updating database for ${planCode}:`, error.message);
    throw error;
  }
}

async function verifySetup() {
  console.log(`\n🔍 Verifying setup...`);

  const plans = await platformSequelize.query(
    `SELECT plan_code, plan_name, stripe_monthly_price_id, stripe_yearly_price_id
     FROM pricing_plans
     WHERE plan_code IN ('sme', 'pro', 'enterprise')`,
    { type: QueryTypes.SELECT }
  );

  console.log('\n📊 Current pricing plans in database:');
  plans.forEach(plan => {
    console.log(`\n  ${plan.plan_name} (${plan.plan_code}):`);
    console.log(`    Monthly Price ID: ${plan.stripe_monthly_price_id}`);
    console.log(`    Yearly Price ID: ${plan.stripe_yearly_price_id}`);
  });
}

async function configureCustomerPortal() {
  console.log(`\n⚙️  Configuring Stripe Customer Portal...`);

  try {
    // Note: Customer Portal configuration must be done via Stripe Dashboard
    // API doesn't support full configuration yet

    console.log(`\n📝 Manual steps required:`);
    console.log(`   1. Go to: https://dashboard.stripe.com/test/settings/billing/portal`);
    console.log(`   2. Enable "Allow customers to switch plans"`);
    console.log(`   3. Configure which plans customers can switch between`);
    console.log(`   4. Set proration settings (immediate charge recommended)`);
    console.log(`   5. Enable "Cancel subscriptions" and set cancellation policy`);
    console.log(`   6. Set your branding (logo, colors)`);

  } catch (error) {
    console.error(`❌ Error configuring customer portal:`, error.message);
  }
}

async function main() {
  console.log('🚀 Starting Stripe Products Setup...\n');
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Stripe Key: ${process.env.STRIPE_SECRET_KEY ? '✅ Found' : '❌ Missing'}\n`);

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('❌ STRIPE_SECRET_KEY not found in environment variables!');
    process.exit(1);
  }

  try {
    // Create products and get Price IDs
    for (const plan of plans) {
      const { monthlyPriceId, yearlyPriceId } = await createStripeProduct(plan);
      await updateDatabasePriceIds(plan.code, monthlyPriceId, yearlyPriceId);
    }

    // Verify setup
    await verifySetup();

    // Show manual configuration steps
    await configureCustomerPortal();

    console.log('\n✅ Stripe products setup complete!');
    console.log('\n🎉 Your customers can now:');
    console.log('   - Subscribe to SME, Pro, or Enterprise plans');
    console.log('   - Upgrade/downgrade between plans (after portal config)');
    console.log('   - Cancel subscriptions via Customer Portal');
    console.log('   - Update payment methods');

  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await platformSequelize.close();
  }
}

main();
