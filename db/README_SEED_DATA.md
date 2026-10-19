# Database Seed Data Organization

## Overview

This directory contains SQL seed data files for initializing the Business Review 360 database with a demo organization and sample ideas.

## File Structure

### Core Files

1. **`platform_schema.sql`** - Platform database schema (tenants, pricing_plans, stripe tables)
2. **`clean_minimal_schema.sql`** - App database schema with RLS policies
3. **`clean_test_data.sql`** - Demo organization and test users (development only)
4. **`seed-demo-corp.sql`** - Demo Corp sample ideas (15 ideas)

### Migrations

Located in `migrations/` folder:
- Applied sequentially to update existing databases

## Demo Organization

| Organization | Org ID | Admin User | User Account | Password | Tenant ID |
|-------------|--------|------------|--------------|----------|-----------|
| **Demo Corp** (Insurance) | `demo-corp` | `dcadmin` | `dcuser` | `Password123!` | `33333333-3333-3333-3333-333333333303` |

## Production Deployment

For production, new organizations are created through:
1. Stripe Checkout - creates tenant and organization automatically
2. Manual provisioning script - `backend/scripts/provision-free-tenant.js`

**Demo Corp** can optionally be loaded for demo purposes.

## Development Setup

When you run `docker-compose up -d db backend`, the database is initialized with:
- Demo Corp organization
- Test user accounts (dcadmin, dcuser)
- 15 sample ideas for Demo Corp

## Seed Data Content

### Demo Corp (Insurance & Call Centre) - 15 Ideas
- AI-powered call routing
- Automated quote generation
- Self-service claim portal
- Customer callback system
- Knowledge base improvements
- Training programs
- Process improvements
- Cost reduction initiatives
- Employee experience improvements

## Verifying Loaded Data

Check organization data:

```bash
docker exec business-review-360-db-1 psql -U business_review_user -d business_review_db \
  -c "SELECT o.\"organizationId\", o.\"organizationName\", COUNT(i.id) as idea_count
      FROM \"Organizations\" o
      LEFT JOIN \"Ideas\" i ON o.\"organizationId\" = i.\"organizationId\"
      GROUP BY o.\"organizationId\", o.\"organizationName\"
      ORDER BY o.\"organizationId\";"
```

## Schema Updates

If the database schema is updated:
1. Create a new migration file in `migrations/`
2. Apply migration to existing databases
3. Update seed files if needed

## Important Notes

1. **tenant_id is required** - All records must have a valid tenant_id
2. **UUIDs must be unique** - Each entity uses a unique UUID
3. **Slugs are unique per tenant** - Format: `title-with-5-digit-number`
4. **ON CONFLICT DO NOTHING** - Safe to re-run seed files without duplicating data
