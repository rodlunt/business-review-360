# Stripe Setup Guide

This guide covers setting up Stripe for Business Review 360 billing.

## Overview

Business Review 360 uses Stripe for subscription billing with the following plans:

- **Pro Plan:** $49.95/month or $509.40/year (15% discount) inc GST
- **Enterprise Plan:** $249.00/month or $2,539.80/year (15% discount) inc GST

## Prerequisites

1. Stripe account (create at https://stripe.com)
2. Access to Stripe Dashboard
3. ABN: 80 850 397 471 (for Australian business setup)

## Step 1: Create Products in Stripe Dashboard

### Create Pro Plan Product

1. Go to **Products** in Stripe Dashboard
2. Click **+ Add product**
3. Configure:
   - **Name:** Business Review 360 - Pro
   - **Description:** Professional plan with multi-organization support, custom branding, and advanced analytics
   - **Pricing:**
     - Add price: **$49.95 AUD** - Recurring monthly
     - Add price: **$509.40 AUD** - Recurring yearly

### Create Enterprise Plan Product

1. Click **+ Add product**
2. Configure:
   - **Name:** Business Review 360 - Enterprise
   - **Description:** Enterprise plan with SSO, custom domain, priority support, and SLA
   - **Pricing:**
     - Add price: **$249.00 AUD** - Recurring monthly
     - Add price: **$2,539.80 AUD** - Recurring yearly

## Step 2: Copy Price IDs

After creating products, click on each price to view its details. Copy the Price ID (starts with `price_`):

- Pro Monthly: `price_xxxxxxxxxxxxxxxxxxxxx`
- Pro Yearly: `price_xxxxxxxxxxxxxxxxxxxxx`
- Enterprise Monthly: `price_xxxxxxxxxxxxxxxxxxxxx`
- Enterprise Yearly: `price_xxxxxxxxxxxxxxxxxxxxx`

## Step 3: Get API Keys

1. Go to **Developers** → **API keys**
2. Copy your keys:
   - **Publishable key** (starts with `pk_test_` or `pk_live_`)
   - **Secret key** (starts with `sk_test_` or `sk_live_`)

⚠️ **Security:** Never commit secret keys to git. Use environment variables.

## Step 4: Configure Environment Variables

Add the following to your `.env` file (backend):

```bash
# Stripe API Keys
STRIPE_SECRET_KEY=sk_test_your_actual_secret_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_actual_publishable_key

# Stripe Price IDs (from Step 2)
STRIPE_PRICE_PRO_MONTH=price_your_pro_monthly_id
STRIPE_PRICE_PRO_YEAR=price_your_pro_yearly_id
STRIPE_PRICE_ENT_MONTH=price_your_enterprise_monthly_id
STRIPE_PRICE_ENT_YEAR=price_your_enterprise_yearly_id

# Stripe Webhook (from Step 5)
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
```

Add to frontend `.env`:

```bash
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_actual_publishable_key
```

## Step 5: Set Up Webhooks (Future Implementation)

When implementing Stripe Checkout:

1. Go to **Developers** → **Webhooks**
2. Add endpoint: `https://yourdomain.com/api/stripe/webhook`
3. Select events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
4. Copy the **Signing secret** (`whsec_...`)

## Step 6: Test Mode vs Live Mode

### Test Mode (Development)
- Use test API keys (`sk_test_`, `pk_test_`)
- Use test card numbers (see [Stripe Test Cards](https://stripe.com/docs/testing))
- No real charges are made

### Live Mode (Production)
- Switch to live API keys (`sk_live_`, `pk_live_`)
- Real charges will be processed
- Ensure all testing is complete before switching

## Pricing Details

### Pro Plan Features
- 40 users
- 200 ideas
- Multiple organizations
- Custom subdomains
- Custom branding
- Advanced analytics
- Row-level security (RLS)
- Email support

### Enterprise Plan Features
- 200 users
- 1,000 ideas
- Everything in Pro, plus:
- SSO / SAML
- Custom domain
- Priority support
- 99.9% uptime SLA
- Dedicated account manager

## Australian GST Compliance

**Note:** Stripe Tax will be configured in a future milestone. See STRIPE_TAX_SETUP.md for details.

Current pricing includes GST (10%):
- Pro: $49.95 inc GST ($45.41 ex GST)
- Enterprise: $99.00 inc GST ($90.00 ex GST)

## References

- [Stripe Dashboard](https://dashboard.stripe.com)
- [Stripe Products Documentation](https://stripe.com/docs/products-prices/overview)
- [Stripe Checkout Documentation](https://stripe.com/docs/payments/checkout)
- [Stripe Testing Documentation](https://stripe.com/docs/testing)

## Troubleshooting

### Can't find Price IDs
- Go to **Products** → Click on product → Click on individual prices
- Price ID will be shown at the top

### API keys not working
- Ensure you're using the correct mode (test vs live)
- Check that keys aren't expired or deleted
- Verify keys have correct permissions

### Webhook issues
- Verify endpoint URL is publicly accessible
- Check webhook signing secret is correct
- Review webhook logs in Stripe Dashboard

## Next Steps

After completing this setup:

1. ✅ Environment variables configured
2. ⏳ Implement Stripe Checkout flow (see issue #323)
3. ⏳ Implement webhook handlers (see issue #324)
4. ⏳ Enable Stripe Tax for GST (future milestone)
