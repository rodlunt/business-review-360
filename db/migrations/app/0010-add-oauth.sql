-- OAuth social login + enterprise Azure AD SSO support.
-- Allows passwordHash to be NULL for OAuth-only accounts.
-- Per-org toggles control which providers are visible on the login form.

ALTER TABLE "Users" ALTER COLUMN "passwordHash" DROP NOT NULL;

CREATE TABLE IF NOT EXISTS "OAuthLinks" (
  "id"             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"         UUID         NOT NULL REFERENCES "Users"("id") ON DELETE CASCADE,
  "organizationId" VARCHAR(255) NOT NULL,
  "provider"       VARCHAR(50)  NOT NULL,
  "providerId"     VARCHAR(255) NOT NULL,
  "providerEmail"  VARCHAR(255),
  "createdAt"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE ("provider", "providerId", "organizationId")
);

CREATE INDEX IF NOT EXISTS "idx_oauthlinks_userid" ON "OAuthLinks" ("userId");

ALTER TABLE "Organizations" ADD COLUMN IF NOT EXISTS "oauthGoogleEnabled"    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organizations" ADD COLUMN IF NOT EXISTS "oauthGithubEnabled"    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organizations" ADD COLUMN IF NOT EXISTS "oauthMicrosoftEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organizations" ADD COLUMN IF NOT EXISTS "ssoAzureEnabled"       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organizations" ADD COLUMN IF NOT EXISTS "ssoAzureTenantId"      VARCHAR(255);
ALTER TABLE "Organizations" ADD COLUMN IF NOT EXISTS "ssoAllowedDomains"     JSON NOT NULL DEFAULT '[]';
