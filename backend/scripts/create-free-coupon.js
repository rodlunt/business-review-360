/**
 * Create promotional coupons in Stripe
 *
 * Usage:
 *   node backend/scripts/create-free-coupon.js [type]
 *
 * Types:
 *   forever  - 100% off forever (default) - for partners/beta users
 *   trial    - 100% off for 1 month - free trial
 *
 * Examples:
 *   node backend/scripts/create-free-coupon.js         # Creates forever coupon
 *   node backend/scripts/create-free-coupon.js trial   # Creates 1-month trial
 */

import Stripe from 'stripe';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia',
});

async function createForeverCoupon() {
  console.log('Creating 100% off FOREVER coupon...\n');

  try {
    const coupon = await stripe.coupons.create({
      percent_off: 100,
      duration: 'forever',
      name: 'Free Account - Partner/Beta',
      metadata: {
        purpose: 'Free account for partners and beta users',
        created_by: 'admin-script',
      },
    });

    console.log('✅ Coupon created successfully!\n');
    console.log('Coupon ID:', coupon.id);
    console.log('Discount: 100% off forever');

    const promoCode = await stripe.promotionCodes.create({
      coupon: coupon.id,
      code: 'PARTNER100',
      max_redemptions: 10,
      metadata: {
        purpose: 'Free accounts for partners',
      },
    });

    console.log('✅ Promotion code created: PARTNER100');
    console.log('Max redemptions: 10');
    console.log('\nCustomers can use code "PARTNER100" at checkout for 100% off forever.');

  } catch (error) {
    if (error.code === 'resource_already_exists') {
      console.log('Coupon or promo code already exists.');
    } else {
      console.error('Error:', error.message);
    }
  }
}

async function createTrialCoupon() {
  console.log('Creating 100% off 1-MONTH TRIAL coupon...\n');

  try {
    const coupon = await stripe.coupons.create({
      percent_off: 100,
      duration: 'repeating',
      duration_in_months: 1,
      name: 'Free Trial - 1 Month',
      metadata: {
        purpose: 'One month free trial',
        created_by: 'admin-script',
      },
    });

    console.log('✅ Coupon created successfully!\n');
    console.log('Coupon ID:', coupon.id);
    console.log('Discount: 100% off for 1 month');

    const promoCode = await stripe.promotionCodes.create({
      coupon: coupon.id,
      code: 'FREETRIAL',
      max_redemptions: 100,
      metadata: {
        purpose: 'One month free trial for new customers',
      },
    });

    console.log('✅ Promotion code created: FREETRIAL');
    console.log('Max redemptions: 100');
    console.log('\nCustomers can use code "FREETRIAL" at checkout for 1 month free.');
    console.log('After 1 month, normal billing begins automatically.');

  } catch (error) {
    if (error.code === 'resource_already_exists') {
      console.log('Coupon or promo code already exists.');
    } else {
      console.error('Error:', error.message);
    }
  }
}

// Parse command line argument
const type = process.argv[2] || 'forever';

if (type === 'trial') {
  createTrialCoupon();
} else if (type === 'forever') {
  createForeverCoupon();
} else {
  console.log('Usage: node create-free-coupon.js [forever|trial]');
  console.log('  forever - 100% off forever (partners/beta)');
  console.log('  trial   - 100% off for 1 month (free trial)');
  process.exit(1);
}
