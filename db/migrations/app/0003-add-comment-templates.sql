-- Issue #525: quick-reply templates per organisation

CREATE TABLE IF NOT EXISTS "CommentTemplates" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    "organizationId" VARCHAR(255) NOT NULL,
    tenant_id UUID NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "comment_templates_org_idx"    ON "CommentTemplates" ("organizationId");
CREATE INDEX IF NOT EXISTS "comment_templates_tenant_idx" ON "CommentTemplates" (tenant_id);
