# Reserved Organization IDs

This document lists organization IDs that are reserved and cannot be used by customers.

## Purpose

Reserved IDs prevent conflicts with:
- System routes and endpoints
- Marketing/documentation pages
- Administrative functions
- Common generic terms that could cause confusion

## Validation Rules

Organization IDs must:
- Match regex: `^[a-z0-9-]{3,30}$`
- Be automatically lowercased
- Not be in the reserved list below

## Reserved List

### System Routes
- `api`
- `admin`
- `system`
- `platform`
- `app`
- `application`

### Authentication & User Management
- `auth`
- `login`
- `logout`
- `register`
- `signup`
- `signin`
- `user`
- `users`
- `account`
- `accounts`
- `profile`
- `password`
- `reset`

### Marketing & Public Pages
- `www`
- `home`
- `about`
- `contact`
- `pricing`
- `features`
- `demo`
- `docs`
- `documentation`
- `help`
- `support`
- `blog`
- `news`

### Billing & Subscriptions
- `billing`
- `payment`
- `checkout`
- `subscribe`
- `subscription`
- `invoice`
- `stripe`

### Technical & Operations
- `static`
- `assets`
- `uploads`
- `images`
- `files`
- `download`
- `downloads`
- `cdn`
- `cache`

### Analytics & Monitoring
- `analytics`
- `metrics`
- `stats`
- `health`
- `status`
- `monitor`
- `sentry`

### Common Generic Terms
- `test`
- `testing`
- `dev`
- `development`
- `prod`
- `production`
- `staging`
- `demo`
- `example`
- `sample`
- `default`
- `public`
- `private`

### Brand & Product
- `business-review-360`
- `businessreview360`
- `br360`
- `business-review`
- `businessreview`

### Webhooks & Integrations
- `webhook`
- `webhooks`
- `callback`
- `oauth`
- `integration`
- `integrations`

### Reserved for Future Use
- `enterprise`
- `pro`
- `premium`
- `free`
- `trial`
- `plans`
- `upgrade`
- `downgrade`

## Implementation

### Backend Validation

```javascript
const RESERVED_ORG_IDS = [
  'api', 'admin', 'system', 'platform', 'app', 'application',
  'auth', 'login', 'logout', 'register', 'signup', 'signin',
  'user', 'users', 'account', 'accounts', 'profile', 'password', 'reset',
  'www', 'home', 'about', 'contact', 'pricing', 'features', 'demo',
  'docs', 'documentation', 'help', 'support', 'blog', 'news',
  'billing', 'payment', 'checkout', 'subscribe', 'subscription', 'invoice', 'stripe',
  'static', 'assets', 'uploads', 'images', 'files', 'download', 'downloads', 'cdn', 'cache',
  'analytics', 'metrics', 'stats', 'health', 'status', 'monitor', 'sentry',
  'test', 'testing', 'dev', 'development', 'prod', 'production', 'staging',
  'example', 'sample', 'default', 'public', 'private',
  'business-review-360', 'businessreview360', 'br360', 'business-review', 'businessreview',
  'webhook', 'webhooks', 'callback', 'oauth', 'integration', 'integrations',
  'enterprise', 'pro', 'premium', 'free', 'trial', 'plans', 'upgrade', 'downgrade'
];

function validateOrgId(organizationId) {
  // Convert to lowercase
  orgId = orgId.toLowerCase();

  // Check regex pattern
  if (!/^[a-z0-9-]{3,30}$/.test(organizationId)) {
    return {
      valid: false,
      error: 'Organization ID must be 3-30 characters, lowercase letters, numbers, and hyphens only'
    };
  }

  // Check reserved list
  if (RESERVED_ORG_IDS.includes(organizationId)) {
    return {
      valid: false,
      error: 'This organization ID is reserved. Please choose a different one.'
    };
  }

  return { valid: true };
}
```

### Frontend Validation

```javascript
// Real-time validation in form
const validateOrgIdInput = (value) => {
  const normalized = value.toLowerCase();

  if (normalized.length < 3) {
    return 'Organization ID must be at least 3 characters';
  }

  if (normalized.length > 30) {
    return 'Organization ID must be 30 characters or less';
  }

  if (!/^[a-z0-9-]+$/.test(normalized)) {
    return 'Only lowercase letters, numbers, and hyphens allowed';
  }

  if (RESERVED_ORG_IDS.includes(normalized)) {
    return 'This organization ID is reserved';
  }

  return null; // Valid
};
```

## Error Messages

### User-Friendly Messages

- **Too short:** "Organization ID must be at least 3 characters"
- **Too long:** "Organization ID must be 30 characters or less"
- **Invalid characters:** "Only lowercase letters, numbers, and hyphens allowed"
- **Reserved:** "This organization ID is reserved. Please try another one."
- **Already taken:** "This organization ID is already in use"

### Example UI

```
┌─────────────────────────────────────────┐
│ Organization ID                         │
│ ┌─────────────────────────────────────┐ │
│ │ my-company                          │ │
│ └─────────────────────────────────────┘ │
│ ✓ Available                             │
│                                         │
│ Choose a unique ID for your             │
│ organization URL:                       │
│ my-company.br360.example.com                │
└─────────────────────────────────────────┘
```

## Adding New Reserved IDs

When adding new reserved IDs:

1. Update this document
2. Update `RESERVED_ORG_IDS` array in backend validation
3. Update frontend validation constants
4. Consider impact on existing organizations
5. Add migration if needed to rename conflicting orgs

## Related Issues

- #331: Reserved orgId and validation in UI and API
- #333: Subdomain support on shared stack
