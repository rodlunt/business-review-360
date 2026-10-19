-- Issue #524: saved filter presets per user

CREATE TABLE IF NOT EXISTS "SavedFilters" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    filters JSONB NOT NULL DEFAULT '{}',
    "userId" UUID NOT NULL,
    "organizationId" VARCHAR(255) NOT NULL,
    tenant_id UUID NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "saved_filters_user_idx" ON "SavedFilters" ("userId");
CREATE INDEX IF NOT EXISTS "saved_filters_org_idx"  ON "SavedFilters" ("organizationId");
