# Organization ID Validation

**Issue:** [#331 - Reserved orgId and validation in UI and API](https://github.com/rodlunt/business-review-360/issues/331)
**Epic:** [#318 - Billing and Tenancy v1](https://github.com/rodlunt/business-review-360/issues/318)
**Phase:** 3 - Backend Integration
**Status:** ✅ Complete
**Date:** 2025-10-27

---

## Overview

Organization IDs (organizationId) are critical identifiers in the multi-tenant architecture. This document describes the validation rules, reserved names, and implementation details for orgId validation in both frontend and backend.

**Key Features:**
- Format enforcement: `^[a-z0-9-]{3,30}$`
- 100+ reserved system names blocked
- Automatic lowercase conversion
- Real-time frontend validation
- Backend enforcement in tenant resolver
- User-friendly error messages

---

## Validation Rules

### Format Requirements

| Rule | Description | Example |
|------|-------------|---------|
| **Characters** | Only lowercase letters (a-z), numbers (0-9), hyphens (-) | ✅ `acme-corp` ✅ `company123` ❌ `ACME` ❌ `acme_corp` |
| **Length** | 3-30 characters | ✅ `xyz` ✅ `my-organization-name-2024` ❌ `ab` ❌ `this-is-a-very-long-organization-name-that-exceeds-thirty-characters` |
| **Start** | Cannot start with hyphen | ✅ `acme-corp` ❌ `-acme` |
| **End** | Cannot end with hyphen | ✅ `acme-corp` ❌ `acme-` |
| **Consecutive** | Cannot have consecutive hyphens | ✅ `acme-corp` ❌ `acme--corp` |
| **Case** | Automatically lowercased | `ACME` → `acme` |

### Reserved Names

**100+ reserved organization IDs** that cannot be used:

<details>
<summary><strong>System Routes (10)</strong></summary>

```
api, admin, www, app, auth,
login, logout, register, signup, signin
```

Reserved to prevent conflicts with application routes.
</details>

<details>
<summary><strong>Common Subdomains (9)</strong></summary>

```
mail, email, smtp, pop, imap,
ftp, sftp, ssh, vpn
```

Reserved to prevent conflicts with standard subdomain conventions.
</details>

<details>
<summary><strong>System Features (12)</strong></summary>

```
health, status, metrics, analytics, billing,
payment, checkout, invoice, subscription,
plan, pricing
```

Reserved for platform features and monitoring.
</details>

<details>
<summary><strong>Asset/Static Routes (10)</strong></summary>

```
static, assets, public, cdn, media,
images, img, js, css, fonts
```

Reserved for static file serving and CDN routes.
</details>

<details>
<summary><strong>User/Auth Related (10)</strong></summary>

```
user, users, profile, account, settings,
password, reset, verify, confirm
```

Reserved for user management routes.
</details>

<details>
<summary><strong>Organization Related (8)</strong></summary>

```
org, organization, organizations, team, teams,
tenant, tenants, company, companies
```

Reserved to prevent confusion with organization management.
</details>

<details>
<summary><strong>Content/Features (10)</strong></summary>

```
idea, ideas, comment, comments, vote, votes,
category, categories, tag, tags, search, filter
```

Reserved for application feature routes.
</details>

<details>
<summary><strong>Support/Legal (12)</strong></summary>

```
support, help, docs, documentation, faq,
contact, about, terms, privacy, legal, security
```

Reserved for support and legal pages.
</details>

<details>
<summary><strong>Test/Dev (8)</strong></summary>

```
test, testing, demo, sandbox,
dev, development, staging, prod, production
```

Reserved for testing and deployment environments.
</details>

<details>
<summary><strong>Dashboard/App Sections (8)</strong></summary>

```
dashboard, overview, reports,
export, import, backup, restore
```

Reserved for application sections.
</details>

<details>
<summary><strong>Webhooks/Integrations (6)</strong></summary>

```
webhook, webhooks, integration,
integrations, callback, oauth
```

Reserved for webhook and integration endpoints.
</details>

<details>
<summary><strong>Potentially Confusing (7)</strong></summary>

```
null, undefined, true, false,
none, empty
```

Reserved to prevent confusion with programming keywords.
</details>

<details>
<summary><strong>System/Security (4)</strong></summary>

```
admin123, root, system, internal
```

Reserved for security (common attack targets).
</details>

<details>
<summary><strong>Branding Protection (3)</strong></summary>

```
br360, businessreview, business-review
```

Reserved to protect platform branding.
</details>

**Total:** 100+ reserved names across 14 categories

---

## Implementation

### Backend Validation

**Location:** `backend/src/utils/orgIdValidation.js`

**Key Functions:**

```javascript
// Validate organization ID
const result = validateOrgId("ACME-Corp");
// {
//   valid: true,
//   error: null,
//   sanitized: "acme-corp"
// }

// Check if reserved
const reserved = isReservedOrgId("admin");
// true

// Sanitize (lowercase, trim)
const clean = sanitizeOrgId("  ACME  ");
// "acme"

// Get validation error for API response
const apiError = getOrgIdValidationError("admin");
// {
//   error: "\"admin\" is a reserved name...",
//   code: "INVALID_ORG_ID",
//   field: "organizationId",
//   provided: "admin",
//   sanitized: "admin"
// }
```

**Middleware Usage:**

```javascript
import { validateOrgIdMiddleware } from "../utils/orgIdValidation.js";

// Validate from body (POST/PUT)
router.post("/organizations", validateOrgIdMiddleware("body"), async (req, res) => {
  // req.body.organizationId is now validated and sanitized
});

// Validate from params (GET)
router.get("/org/:organizationId", validateOrgIdMiddleware("params"), async (req, res) => {
  // req.params.orgId is now validated and sanitized
});

// Validate from query (GET)
router.get("/data", validateOrgIdMiddleware("query"), async (req, res) => {
  // req.query.orgId is now validated and sanitized
});
```

**Integration with Tenant Resolver:**

The tenant resolver middleware ([backend/src/middleware/tenantResolver.js](../backend/src/middleware/tenantResolver.js:150-165)) automatically validates orgId before querying the platform database:

```javascript
export const resolveTenant = async (req, res, next) => {
  const organizationId = extractOrgId(req);

  // Validate orgId format (#331)
  const validation = validateOrgId(organizationId);
  if (!validation.valid) {
    return res.status(400).json({
      error: validation.error,
      code: "INVALID_ORG_ID",
      field: "organizationId",
      provided: organizationId,
    });
  }

  // Use sanitized version for database query
  const tenant = await getTenantByOrgId(validation.sanitized);
  // ...
};
```

### Frontend Validation

**Location:** `frontend/src/utils/orgIdValidation.js`

**Key Functions:**

```javascript
// Validate organization ID
const result = validateOrgId("acme-corp");
// {
//   valid: true,
//   error: null,
//   sanitized: "acme-corp"
// }

// Get error message for text field
const error = getOrgIdError("admin");
// "admin" is a reserved name and cannot be used...

// Check if reserved
const reserved = isReservedOrgId("api");
// true

// Sanitize
const clean = sanitizeOrgId("  ACME  ");
// "acme"
```

**Component Usage:**

```javascript
import { validateOrgId } from '../utils/orgIdValidation';

function MyComponent() {
  const [orgId, setOrgId] = useState('');
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const value = e.target.value;
    setOrgId(value);

    // Real-time validation
    if (value.trim().length > 0) {
      const validation = validateOrgId(value);
      setError(validation.valid ? '' : validation.error);
    }
  };

  const handleSubmit = () => {
    const validation = validateOrgId(organizationId);
    if (!validation.valid) {
      setError(validation.error);
      return;
    }
    // Use validation.sanitized for API call
    api.createOrg(validation.sanitized);
  };

  return (
    <TextField
      value={organizationId}
      onChange={handleChange}
      error={!!error}
      helperText={error || "Only lowercase letters, numbers, and hyphens (3-30 characters)"}
    />
  );
}
```

**Integration with OrganizationPrompt:**

The organization prompt component ([frontend/src/components/OrganizationPrompt.js](../frontend/src/components/OrganizationPrompt.js:32-66)) uses validation:

```javascript
const handleOrgIdChange = (e) => {
  const value = e.target.value;
  setOrgId(value);

  // Real-time validation
  if (value.trim().length > 0) {
    const validation = validateOrgId(value);
    if (!validation.valid) {
      setFieldError(validation.error);
    }
  }
};

const handleSubmit = (e) => {
  e.preventDefault();

  const validation = validateOrgId(organizationId);
  if (!validation.valid) {
    setFieldError(validation.error);
    return;
  }

  // Navigate with sanitized orgId
  navigate(`/org/${validation.sanitized}`);
};
```

---

## Error Responses

### Backend Error Response

```json
{
  "error": "Organization ID can only contain lowercase letters, numbers, and hyphens",
  "code": "INVALID_ORG_ID",
  "field": "organizationId",
  "provided": "acme_corp"
}
```

### Common Error Messages

| Input | Error Message |
|-------|---------------|
| `ab` | Organization ID must be at least 3 characters |
| `this-is-a-very-long-organization-name-that-exceeds-thirty` | Organization ID must be at most 30 characters |
| `Acme Corp` | Organization ID can only contain lowercase letters, numbers, and hyphens |
| `-acme` | Organization ID cannot start with a hyphen |
| `acme-` | Organization ID cannot end with a hyphen |
| `acme--corp` | Organization ID cannot contain consecutive hyphens |
| `admin` | "admin" is a reserved name and cannot be used. Please choose a different organization ID. |
| ` ` (empty) | Organization ID is required |

---

## Validation Flow

### 1. Frontend Flow

```
User types "ACME-Corp"
        ↓
Real-time validation (onChange)
        ↓
validateOrgId("ACME-Corp")
        ↓
{ valid: true, sanitized: "acme-corp" }
        ↓
Show helper text (no error)
        ↓
User submits form
        ↓
Navigate to /org/acme-corp
```

### 2. Backend Flow

```
Request: GET /api/org/acme-corp/ideas
        ↓
resolveTenant middleware extracts "acme-corp"
        ↓
validateOrgId("acme-corp")
        ↓
{ valid: true, sanitized: "acme-corp" }
        ↓
Query platform DB: SELECT * FROM tenants WHERE org_id = 'acme-corp'
        ↓
Continue processing request
```

### 3. Error Flow (Reserved Name)

```
User types "admin"
        ↓
Real-time validation (onChange)
        ↓
validateOrgId("admin")
        ↓
{ valid: false, error: '"admin" is a reserved name...' }
        ↓
Show error in TextField
        ↓
User submits form (blocked)
        ↓
Error remains visible
```

---

## Testing

### Backend Testing

```bash
# Test with valid orgId
curl http://localhost:4000/api/org/acme-corp/ideas \
  -H "Authorization: Bearer <token>"

# Test with invalid format (uppercase)
curl http://localhost:4000/api/org/ACME/ideas \
  -H "Authorization: Bearer <token>"
# Expected: 400 - INVALID_ORG_ID

# Test with reserved name
curl http://localhost:4000/api/org/admin/ideas \
  -H "Authorization: Bearer <token>"
# Expected: 400 - INVALID_ORG_ID

# Test with special characters
curl http://localhost:4000/api/org/acme_corp/ideas \
  -H "Authorization: Bearer <token>"
# Expected: 400 - INVALID_ORG_ID

# Test with too short
curl http://localhost:4000/api/org/ab/ideas \
  -H "Authorization: Bearer <token>"
# Expected: 400 - INVALID_ORG_ID
```

### Frontend Testing

**Manual Testing:**

1. Navigate to organization prompt page
2. Try entering invalid formats:
   - Uppercase: `ACME` → See error
   - Special chars: `acme_corp` → See error
   - Too short: `ab` → See error
   - Too long: `this-is-a-very-long-organization-name-that-exceeds-thirty-characters` → See error
   - Reserved: `admin` → See error
   - Consecutive hyphens: `acme--corp` → See error
3. Try entering valid format:
   - `acme-corp` → No error, can submit

**Unit Testing:**

```javascript
import { validateOrgId, isReservedOrgId } from '../utils/orgIdValidation';

describe('orgIdValidation', () => {
  test('valid organizationId', () => {
    const result = validateOrgId('acme-corp');
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe('acme-corp');
  });

  test('uppercase is lowercased', () => {
    const result = validateOrgId('ACME');
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe('acme');
  });

  test('reserved name rejected', () => {
    const result = validateOrgId('admin');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('reserved name');
  });

  test('invalid characters rejected', () => {
    const result = validateOrgId('acme_corp');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('lowercase letters, numbers, and hyphens');
  });

  test('too short rejected', () => {
    const result = validateOrgId('ab');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('at least 3 characters');
  });

  test('checks reserved correctly', () => {
    expect(isReservedOrgId('admin')).toBe(true);
    expect(isReservedOrgId('acme-corp')).toBe(false);
  });
});
```

---

## Files Changed

### Created:
- `backend/src/utils/orgIdValidation.js` (360 lines) - Backend validation utilities
- `frontend/src/utils/orgIdValidation.js` (280 lines) - Frontend validation utilities
- `docs/ORG_ID_VALIDATION.md` (this file) - Documentation

### Modified:
- `backend/src/middleware/tenantResolver.js` - Added validation before platform DB query
- `frontend/src/components/OrganizationPrompt.js` - Added real-time validation and helper text

---

## Security Benefits

1. **SQL Injection Prevention**: Format validation prevents special characters
2. **Route Conflicts**: Reserved names prevent conflicts with system routes
3. **Branding Protection**: Reserved names protect platform identity
4. **User Experience**: Clear error messages guide users to valid inputs
5. **Data Integrity**: Consistent format ensures reliable tenant resolution
6. **Future-Proofing**: Reserved list can be expanded as needed

---

## Future Enhancements

### Uniqueness Checking (Phase 4)

Currently, validation only checks format and reserved names. Uniqueness checking will be added in Phase 4 (Billing Integration) when tenant provisioning is implemented:

```javascript
// Future implementation
async function validateOrgIdUniqueness(organizationId) {
  const exists = await platformSequelize.query(
    "SELECT COUNT(*) FROM tenants WHERE org_id = :organizationId",
    { replacements: { orgId }, type: QueryTypes.SELECT }
  );
  return exists[0].count === 0;
}
```

### Custom Reserved Lists (Per-Tenant)

Allow enterprise customers to reserve additional names:

```sql
CREATE TABLE custom_reserved_org_ids (
  id UUID PRIMARY KEY,
  org_id VARCHAR(255) NOT NULL,
  reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Profanity Filtering

Add comprehensive profanity/inappropriate content filtering:

```javascript
import Filter from 'bad-words';

const filter = new Filter();
if (filter.isProfane(organizationId)) {
  return { valid: false, error: "Organization ID contains inappropriate content" };
}
```

---

## Acceptance Criteria

- [x] Regex enforcement: `^[a-z0-9-]{3,30}$`
- [x] Automatic lowercase conversion
- [x] 100+ reserved names blocked
- [x] Frontend validation with real-time feedback
- [x] Backend validation in tenant resolver
- [x] User-friendly error messages
- [x] Helper text in form fields
- [x] Documentation complete

---

## Related Documentation

- [Tenant Resolver Guide](./TENANT_RESOLVER.md) - Middleware integration
- [Control Plane Database](./CONTROL_PLANE_DATABASE.md) - Platform DB schema
- Organizations Deprecation - Architecture changes

---

**Status:** ✅ Complete
**Date:** 2025-10-27
**Issue:** [#331](https://github.com/rodlunt/business-review-360/issues/331)
**Epic:** [#318](https://github.com/rodlunt/business-review-360/issues/318)
