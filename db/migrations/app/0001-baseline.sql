-- Business Review 360 Clean Database Schema - Only Required Fields

-- Organizations table - multi-tenant support
CREATE TABLE "Organizations" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "organizationId" VARCHAR(255) UNIQUE NOT NULL,
    "organizationName" VARCHAR(255) NOT NULL,
    "organizationDescription" TEXT,
    "primaryColor" VARCHAR(7) DEFAULT '#1565c0',
    "logoUrl" VARCHAR(500),
    "logoHighContrast" BOOLEAN DEFAULT false,
    "bigQuestion" TEXT,
    "allowAnonymousUsers" BOOLEAN DEFAULT false,
    "useCaptcha" BOOLEAN DEFAULT true,
    "allowAnonymousIdeas" BOOLEAN DEFAULT false,
    "requireApproval" BOOLEAN DEFAULT true,
    "maxIdeasPerUser" INTEGER,
    "enablePwaPrompt" BOOLEAN DEFAULT false,
    "allowSelfRegistration" BOOLEAN DEFAULT true,
    "domainRestrictionMode" VARCHAR(20) DEFAULT 'none' CHECK ("domainRestrictionMode" IN ('none', 'whitelist', 'blacklist')),
    "allowedDomains" JSON DEFAULT '[]',
    "blockedDomains" JSON DEFAULT '[]',
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Users table - authentication and authorization only
-- Schema-follows-model: see issue #537 for the drift audit that aligned this
-- CREATE TABLE with the Sequelize User model. Engagement-tracking columns
-- (lastActiveAt, lastEngagementEmailSent, lastSurveySent) are declared inline
-- here and the trailing ALTER TABLE ... IF NOT EXISTS block kept as a no-op
-- for any pre-existing database that still needs them.
CREATE TABLE "Users" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(255) UNIQUE NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    "isAdmin" BOOLEAN DEFAULT false,
    "isAnonymous" BOOLEAN DEFAULT true,
    "isApproved" BOOLEAN NOT NULL DEFAULT true,
    "organizationId" VARCHAR(255),
    "tenant_id" UUID NOT NULL,
    "passwordResetToken" VARCHAR(255),
    "passwordResetExpires" TIMESTAMP WITH TIME ZONE,
    "lastActiveAt" TIMESTAMP WITH TIME ZONE,
    "lastEngagementEmailSent" TIMESTAMP WITH TIME ZONE,
    "lastSurveySent" TIMESTAMP WITH TIME ZONE,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Categories table - simple lookup for idea categorization
CREATE TABLE "Categories" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    "organizationId" VARCHAR(255),
    "tenant_id" UUID,
    "createdBy" UUID,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ideas table - core idea management
CREATE TABLE "Ideas" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(255),
    status VARCHAR(100) DEFAULT 'Reviewing',
    priority INTEGER DEFAULT 1,
    "isPinned" BOOLEAN DEFAULT false,
    "isPrivate" BOOLEAN DEFAULT false,
    "wouldSpendOwnMoney" BOOLEAN DEFAULT false,
    "timeSavedMinutes" INTEGER,
    "frequencyCount" INTEGER CHECK ("frequencyCount" IS NULL OR "frequencyCount" > 0),
    "frequencyPeriod" VARCHAR(20) CHECK ("frequencyPeriod" IS NULL OR "frequencyPeriod" IN ('day', 'week', 'month', 'year')),
    "actualTimeSavedMinutes" INTEGER CHECK ("actualTimeSavedMinutes" IS NULL OR "actualTimeSavedMinutes" >= 0),
    "actualFrequencyCount" INTEGER CHECK ("actualFrequencyCount" IS NULL OR "actualFrequencyCount" > 0),
    "actualFrequencyPeriod" VARCHAR(20) CHECK ("actualFrequencyPeriod" IS NULL OR "actualFrequencyPeriod" IN ('day', 'week', 'month', 'year')),
    "impactScore" INTEGER DEFAULT 5 CHECK ("impactScore" >= 1 AND "impactScore" <= 10),
    "effortScore" INTEGER DEFAULT 5 CHECK ("effortScore" >= 1 AND "effortScore" <= 10),
    "roiEstimate" DECIMAL(10,2),
    "matrixPositionX" DECIMAL(5,2),
    "matrixPositionY" DECIMAL(5,2),
    "implementationCost" DECIMAL(10,2),
    email VARCHAR(255),
    "additionalComments" TEXT,
    "orgImpact" TEXT,
    "fixImpact" TEXT,
    solution TEXT,
    slug VARCHAR(255) UNIQUE,
    "organizationId" VARCHAR(255) NOT NULL REFERENCES "Organizations"("organizationId") ON DELETE CASCADE,
    "tenant_id" UUID NOT NULL,
    "authorId" UUID REFERENCES "Users"(id) ON DELETE CASCADE,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Comments table - basic commenting functionality
CREATE TABLE "Comments" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    "authorId" UUID REFERENCES "Users"(id) ON DELETE CASCADE,
    "ideaId" UUID REFERENCES "Ideas"(id) ON DELETE CASCADE,
    "organizationId" VARCHAR(255) NOT NULL REFERENCES "Organizations"("organizationId") ON DELETE CASCADE,
    "tenant_id" UUID NOT NULL,
    "isAdminOnly" BOOLEAN DEFAULT false,
    "isEdited" BOOLEAN DEFAULT false,
    "editedAt" TIMESTAMP WITH TIME ZONE,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Votes table - idea voting system
CREATE TABLE "Votes" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    value INTEGER NOT NULL CHECK (value >= 1 AND value <= 1), -- Only upvotes
    "userId" UUID REFERENCES "Users"(id) ON DELETE CASCADE,
    "ideaId" UUID REFERENCES "Ideas"(id) ON DELETE CASCADE,
    "tenant_id" UUID NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Comment votes table - comment voting system
CREATE TABLE "CommentVotes" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    value INTEGER NOT NULL CHECK (value >= 1 AND value <= 1), -- Only upvotes
    "userId" UUID REFERENCES "Users"(id) ON DELETE CASCADE,
    "commentId" UUID REFERENCES "Comments"(id) ON DELETE CASCADE,
    "organizationId" VARCHAR(255) NOT NULL REFERENCES "Organizations"("organizationId") ON DELETE CASCADE,
    "tenant_id" UUID NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Settings table - DEPRECATED for organization settings
-- All organization-specific settings are now in Organizations table
-- This table is only kept for global app settings (e.g., profanity filter settings)
CREATE TABLE "Settings" (
    key VARCHAR(255) PRIMARY KEY,
    value TEXT NOT NULL
);

-- Create performance indexes
CREATE INDEX idx_ideas_category ON "Ideas"(category);
CREATE INDEX idx_ideas_status ON "Ideas"(status);
CREATE INDEX idx_ideas_priority ON "Ideas"(priority);
CREATE INDEX idx_ideas_pinned ON "Ideas"("isPinned");
CREATE INDEX idx_ideas_private ON "Ideas"("isPrivate");
CREATE INDEX idx_ideas_organization ON "Ideas"("organizationId");
CREATE INDEX idx_ideas_author ON "Ideas"("authorId");
CREATE INDEX idx_ideas_slug ON "Ideas"(slug);
CREATE INDEX idx_ideas_impact_effort ON "Ideas"("impactScore", "effortScore");
CREATE INDEX idx_comments_idea ON "Comments"("ideaId");
CREATE INDEX idx_comments_author ON "Comments"("authorId");
CREATE INDEX idx_comments_organization ON "Comments"("organizationId");
CREATE INDEX idx_commentvotes_organization ON "CommentVotes"("organizationId");
CREATE INDEX idx_votes_idea ON "Votes"("ideaId");
CREATE INDEX idx_votes_user ON "Votes"("userId");
-- Note: Users.username already has a UNIQUE btree index named
-- "Users_username_key", auto-created by the inline UNIQUE column constraint
-- in the CREATE TABLE above. A second non-unique index would be redundant
-- (see #731). Equality lookups on username use the unique index for free.
CREATE INDEX idx_users_email ON "Users"(email);
CREATE INDEX idx_users_org ON "Users"("organizationId");
CREATE INDEX idx_orgs_orgid ON "Organizations"("organizationId");

-- Multi-tenant indexes (from Migration 001)
CREATE INDEX idx_users_tenant_id ON "Users"("tenant_id");
CREATE INDEX idx_ideas_tenant_id ON "Ideas"("tenant_id");
CREATE INDEX idx_comments_tenant_id ON "Comments"("tenant_id");
CREATE INDEX idx_votes_tenant_id ON "Votes"("tenant_id");
CREATE INDEX idx_commentvotes_tenant_id ON "CommentVotes"("tenant_id");
CREATE INDEX idx_categories_tenant_id ON "Categories"("tenant_id");

-- Per-tenant unique indexes (from Migration 002)
CREATE UNIQUE INDEX idx_users_tenant_email_unique
ON "Users"("tenant_id", email)
WHERE email IS NOT NULL;

CREATE UNIQUE INDEX idx_ideas_tenant_slug_unique
ON "Ideas"("tenant_id", slug)
WHERE slug IS NOT NULL;

CREATE UNIQUE INDEX idx_votes_tenant_user_idea_unique
ON "Votes"("tenant_id", "userId", "ideaId");

CREATE UNIQUE INDEX idx_commentvotes_tenant_user_comment_unique
ON "CommentVotes"("tenant_id", "userId", "commentId");

-- Insert default categories (only if they don't exist)
INSERT INTO "Categories" (name) VALUES
    ('Technology'),
    ('Process Improvement'),
    ('Employee Experience'),
    ('Customer Service'),
    ('Cost Reduction'),
    ('Innovation'),
    ('Training'),
    ('Communication'),
    ('Safety'),
    ('Quality');
-- Note: These default categories have NULL organizationId, allowing them to be global/fallback categories

-- Insert default organisation (demo-corp only - other orgs loaded on demand)
INSERT INTO "Organizations" ("organizationId", "organizationName", "organizationDescription", "bigQuestion", "primaryColor", "createdAt", "updatedAt") VALUES
    ('demo-corp', 'Demo Insurance Corp', 'Leading insurance provider with nationwide call centre operations', 'How can we improve customer service, reduce call handling time, and increase policy conversion rates?', '#1976d2', NOW(), NOW())
ON CONFLICT ("organizationId") DO NOTHING;

-- Add foreign key constraints for Categories table
ALTER TABLE "Categories"
ADD CONSTRAINT "Categories_organizationId_fkey"
FOREIGN KEY ("organizationId")
REFERENCES "Organizations"("organizationId")
ON DELETE CASCADE;

ALTER TABLE "Categories"
ADD CONSTRAINT "Categories_createdBy_fkey"
FOREIGN KEY ("createdBy")
REFERENCES "Users"(id)
ON DELETE SET NULL;

-- Create indexes for Categories table performance
CREATE INDEX IF NOT EXISTS idx_categories_org ON "Categories"("organizationId");
CREATE INDEX IF NOT EXISTS idx_categories_name ON "Categories"(name);

-- Ensure unique category names per organization
ALTER TABLE "Categories" ADD CONSTRAINT "Categories_name_org_unique" UNIQUE (name, "organizationId");

-- Insert basic settings (update if exists)
-- NOTE: Organization-specific settings have been removed from Settings table
-- All organization settings are now in Organizations table
INSERT INTO "Settings" (key, value) VALUES
    ('app_name', 'Business Review 360')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- =====================================================
-- ROW-LEVEL SECURITY (RLS) - From Migration 002
-- =====================================================

-- Enable RLS on all tenant tables
ALTER TABLE "Users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Ideas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Comments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Votes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CommentVotes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Categories" ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owners (important for security)
ALTER TABLE "Users" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Ideas" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Comments" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Votes" FORCE ROW LEVEL SECURITY;
ALTER TABLE "CommentVotes" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Categories" FORCE ROW LEVEL SECURITY;

-- Create RLS Policies
CREATE POLICY tenant_isolation_policy ON "Users"
    USING ("tenant_id"::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_policy ON "Ideas"
    USING ("tenant_id"::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_policy ON "Comments"
    USING ("tenant_id"::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_policy ON "Votes"
    USING ("tenant_id"::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_policy ON "CommentVotes"
    USING ("tenant_id"::text = current_setting('app.tenant_id', true));

-- Categories policy allows NULL tenant_id for global categories
CREATE POLICY tenant_isolation_policy ON "Categories"
    USING (
        "tenant_id"::text = current_setting('app.tenant_id', true)
        OR "tenant_id" IS NULL
    );

-- =====================================================
-- NOTIFICATION PREFERENCES (Issue #443)
-- Stores user email notification preferences
-- =====================================================

CREATE TABLE IF NOT EXISTS "NotificationPreferences" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" UUID UNIQUE NOT NULL REFERENCES "Users"(id) ON DELETE CASCADE,

    -- Global frequency setting
    "emailFrequency" VARCHAR(50) DEFAULT 'realtime' CHECK ("emailFrequency" IN ('realtime', 'hourly', 'daily', 'weekly', 'off')),

    -- User notification toggles
    "commentsOnIdeas" BOOLEAN DEFAULT true,
    "repliesToComments" BOOLEAN DEFAULT true,
    "statusChanges" BOOLEAN DEFAULT true,
    "ideaImplemented" BOOLEAN DEFAULT true,
    "newIdeas" BOOLEAN DEFAULT false,
    "weeklySummary" BOOLEAN DEFAULT true,
    "monthlyReports" BOOLEAN DEFAULT true,
    "engagementEmails" BOOLEAN DEFAULT true,

    -- Admin-only notification toggles
    "adminNewIdeas" BOOLEAN DEFAULT true,
    "adminNewIdeasFrequency" VARCHAR(50) DEFAULT 'realtime' CHECK ("adminNewIdeasFrequency" IN ('realtime', 'hourly', 'daily', 'weekly')),
    "adminNeedsAttention" BOOLEAN DEFAULT true,
    "adminMonthlySummary" BOOLEAN DEFAULT true,

    -- Global unsubscribe
    "globalUnsubscribe" BOOLEAN DEFAULT false,

    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_preferences_user ON "NotificationPreferences"("userId");

-- =====================================================
-- IDEA SUBSCRIPTIONS (Issue #443)
-- Per-idea notification subscriptions
-- =====================================================

CREATE TABLE IF NOT EXISTS "IdeaSubscriptions" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL REFERENCES "Users"(id) ON DELETE CASCADE,
    "ideaId" UUID NOT NULL REFERENCES "Ideas"(id) ON DELETE CASCADE,
    "subscribed" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE("userId", "ideaId")
);

CREATE INDEX IF NOT EXISTS idx_idea_subscriptions_user ON "IdeaSubscriptions"("userId");
CREATE INDEX IF NOT EXISTS idx_idea_subscriptions_idea ON "IdeaSubscriptions"("ideaId");

-- Auto-create notification preferences for new users
CREATE OR REPLACE FUNCTION create_default_notification_preferences()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO "NotificationPreferences" ("userId")
    VALUES (NEW.id)
    ON CONFLICT ("userId") DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS create_notification_preferences_trigger ON "Users";
CREATE TRIGGER create_notification_preferences_trigger
    AFTER INSERT ON "Users"
    FOR EACH ROW
    EXECUTE FUNCTION create_default_notification_preferences();

-- =====================================================
-- USER ENGAGEMENT TRACKING COLUMNS (Issue #445)
-- Track user activity for re-engagement emails
-- =====================================================

ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "lastActiveAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "lastEngagementEmailSent" TIMESTAMP WITH TIME ZONE;
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "lastSurveySent" TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_users_last_active ON "Users"("lastActiveAt");

-- =====================================================
-- SURVEYS TABLE (Issue #445)
-- Stores satisfaction survey responses
-- =====================================================

CREATE TABLE IF NOT EXISTS "Surveys" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" UUID REFERENCES "Users"(id) ON DELETE SET NULL,
    "organizationId" VARCHAR(255) NOT NULL REFERENCES "Organizations"("organizationId") ON DELETE CASCADE,
    "type" VARCHAR(50) DEFAULT 'satisfaction',
    "rating" INTEGER CHECK ("rating" IS NULL OR ("rating" >= 1 AND "rating" <= 5)),
    "feedback" TEXT,
    "isAnonymous" BOOLEAN DEFAULT false,
    "metadata" JSONB,
    "source" VARCHAR(50) DEFAULT 'email' CHECK ("source" IN ('email', 'web', 'app')),
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_surveys_user ON "Surveys"("userId");
CREATE INDEX IF NOT EXISTS idx_surveys_org ON "Surveys"("organizationId");
CREATE INDEX IF NOT EXISTS idx_surveys_type ON "Surveys"("type");
CREATE INDEX IF NOT EXISTS idx_surveys_rating ON "Surveys"("rating");
CREATE INDEX IF NOT EXISTS idx_surveys_created ON "Surveys"("createdAt");

-- =====================================================
-- SURVEY TOKENS TABLE (Issue #445)
-- One-click rating tokens for email surveys
-- =====================================================

CREATE TABLE IF NOT EXISTS "SurveyTokens" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "token" VARCHAR(64) UNIQUE NOT NULL,
    "userId" UUID NOT NULL REFERENCES "Users"(id) ON DELETE CASCADE,
    "organizationId" VARCHAR(255) NOT NULL REFERENCES "Organizations"("organizationId") ON DELETE CASCADE,
    "type" VARCHAR(50) DEFAULT 'satisfaction',
    "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "usedAt" TIMESTAMP WITH TIME ZONE,
    "rating" INTEGER CHECK ("rating" IS NULL OR ("rating" >= 1 AND "rating" <= 5)),
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_survey_tokens_token ON "SurveyTokens"("token");
CREATE INDEX IF NOT EXISTS idx_survey_tokens_user ON "SurveyTokens"("userId");
CREATE INDEX IF NOT EXISTS idx_survey_tokens_expires ON "SurveyTokens"("expiresAt");
CREATE INDEX IF NOT EXISTS idx_survey_tokens_used ON "SurveyTokens"("usedAt");

-- =====================================================
-- EMAIL QUEUE TABLE (Issue #446)
-- Stores emails pending delivery with priority and retry
-- =====================================================

CREATE TABLE IF NOT EXISTS "EmailQueue" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" UUID REFERENCES "Users"(id) ON DELETE CASCADE,
    "organizationId" VARCHAR(255) REFERENCES "Organizations"("organizationId") ON DELETE CASCADE,
    "type" VARCHAR(100) NOT NULL,
    "priority" INTEGER DEFAULT 5 CHECK ("priority" >= 1 AND "priority" <= 10),
    "status" VARCHAR(50) DEFAULT 'pending' CHECK ("status" IN ('pending', 'sending', 'sent', 'failed', 'cancelled')),
    "to" VARCHAR(255),
    "subject" VARCHAR(500),
    "data" JSONB NOT NULL DEFAULT '{}',
    "scheduledFor" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "sentAt" TIMESTAMP WITH TIME ZONE,
    "error" TEXT,
    "attempts" INTEGER DEFAULT 0,
    "maxAttempts" INTEGER DEFAULT 3,
    "messageId" VARCHAR(255),
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_queue_status ON "EmailQueue"("status");
CREATE INDEX IF NOT EXISTS idx_email_queue_scheduled ON "EmailQueue"("scheduledFor");
CREATE INDEX IF NOT EXISTS idx_email_queue_priority ON "EmailQueue"("priority", "scheduledFor");
CREATE INDEX IF NOT EXISTS idx_email_queue_user ON "EmailQueue"("userId");
CREATE INDEX IF NOT EXISTS idx_email_queue_org ON "EmailQueue"("organizationId");
CREATE INDEX IF NOT EXISTS idx_email_queue_type ON "EmailQueue"("type");

-- =====================================================
-- EMAIL LOG TABLE (Issue #446)
-- Stores email delivery history for analytics
-- =====================================================

CREATE TABLE IF NOT EXISTS "EmailLog" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" UUID REFERENCES "Users"(id) ON DELETE SET NULL,
    "organizationId" VARCHAR(255) REFERENCES "Organizations"("organizationId") ON DELETE CASCADE,
    "type" VARCHAR(100) NOT NULL,
    "to" VARCHAR(255) NOT NULL,
    "subject" VARCHAR(500),
    "status" VARCHAR(50) DEFAULT 'sent' CHECK ("status" IN ('sent', 'delivered', 'bounced', 'opened', 'clicked', 'complained', 'failed')),
    "messageId" VARCHAR(255),
    "sentAt" TIMESTAMP WITH TIME ZONE,
    "deliveredAt" TIMESTAMP WITH TIME ZONE,
    "openedAt" TIMESTAMP WITH TIME ZONE,
    "clickedAt" TIMESTAMP WITH TIME ZONE,
    "bouncedAt" TIMESTAMP WITH TIME ZONE,
    "error" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_log_user ON "EmailLog"("userId");
CREATE INDEX IF NOT EXISTS idx_email_log_org ON "EmailLog"("organizationId");
CREATE INDEX IF NOT EXISTS idx_email_log_type ON "EmailLog"("type");
CREATE INDEX IF NOT EXISTS idx_email_log_status ON "EmailLog"("status");
CREATE INDEX IF NOT EXISTS idx_email_log_sent_at ON "EmailLog"("sentAt");
CREATE INDEX IF NOT EXISTS idx_email_log_message_id ON "EmailLog"("messageId");

-- =====================================================
-- UNSUBSCRIBE TOKENS TABLE (Issue #447)
-- Stores tokens for one-click email unsubscribe
-- =====================================================

CREATE TABLE IF NOT EXISTS "UnsubscribeTokens" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL REFERENCES "Users"(id) ON DELETE CASCADE,
    "token" VARCHAR(64) UNIQUE NOT NULL,
    "type" VARCHAR(100) NOT NULL DEFAULT 'global',
    "ideaId" UUID REFERENCES "Ideas"(id) ON DELETE CASCADE,
    "ideaTitle" VARCHAR(255),
    "emailType" VARCHAR(100),
    "expiresAt" TIMESTAMP WITH TIME ZONE,
    "usedAt" TIMESTAMP WITH TIME ZONE,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unsubscribe_tokens_token ON "UnsubscribeTokens"("token");
CREATE INDEX IF NOT EXISTS idx_unsubscribe_tokens_user ON "UnsubscribeTokens"("userId");
CREATE INDEX IF NOT EXISTS idx_unsubscribe_tokens_idea ON "UnsubscribeTokens"("ideaId");
CREATE INDEX IF NOT EXISTS idx_unsubscribe_tokens_type ON "UnsubscribeTokens"("type");

-- =====================================================
-- EMAIL ANALYTICS TABLE (Issue #448)
-- Aggregated email metrics for performance tracking
-- =====================================================

CREATE TABLE IF NOT EXISTS "EmailAnalytics" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "organizationId" VARCHAR(255),
    "emailType" VARCHAR(100),
    "date" DATE NOT NULL,
    "sent" INTEGER DEFAULT 0,
    "delivered" INTEGER DEFAULT 0,
    "opened" INTEGER DEFAULT 0,
    "uniqueOpens" INTEGER DEFAULT 0,
    "clicked" INTEGER DEFAULT 0,
    "uniqueClicks" INTEGER DEFAULT 0,
    "bounced" INTEGER DEFAULT 0,
    "softBounced" INTEGER DEFAULT 0,
    "hardBounced" INTEGER DEFAULT 0,
    "dropped" INTEGER DEFAULT 0,
    "spamReported" INTEGER DEFAULT 0,
    "unsubscribed" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE("organizationId", "emailType", "date")
);

CREATE INDEX IF NOT EXISTS idx_email_analytics_org_date ON "EmailAnalytics"("organizationId", "date");
CREATE INDEX IF NOT EXISTS idx_email_analytics_type ON "EmailAnalytics"("emailType");
CREATE INDEX IF NOT EXISTS idx_email_analytics_date ON "EmailAnalytics"("date");

-- Add additional tracking columns to EmailLog (Issue #448)
ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "bounceType" VARCHAR(50);
ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "bounceReason" TEXT;
ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "droppedAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "dropReason" TEXT;
ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "spamReportedAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "unsubscribedViaEmailAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "openCount" INTEGER DEFAULT 0;
ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "clickCount" INTEGER DEFAULT 0;
ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "userAgent" TEXT;
ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "ipAddress" VARCHAR(45);

-- =====================================================
-- USER SESSIONS TABLE (Issue #490)
-- JWT revocation via jti blocklist
-- =====================================================

CREATE TABLE IF NOT EXISTS "UserSessions" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    jti UUID UNIQUE NOT NULL,
    "userId" UUID NOT NULL REFERENCES "Users"(id) ON DELETE CASCADE,
    "organizationId" VARCHAR(255) NOT NULL,
    type VARCHAR(10) NOT NULL DEFAULT 'access' CHECK (type IN ('access', 'refresh')),
    "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "revokedAt" TIMESTAMP WITH TIME ZONE,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usersessions_jti ON "UserSessions"(jti);
CREATE INDEX IF NOT EXISTS idx_usersessions_userid ON "UserSessions"("userId", "revokedAt");
