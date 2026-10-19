-- Migration 0014: Consultant onboarding (Phase 1)
-- Adds Consultants and ConsultantInvites tables for the invite-only
-- consultant referral programme. Consultants are platform-level (no org scope).

CREATE TABLE IF NOT EXISTS "Consultants" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"         UUID REFERENCES "Users"("id") ON DELETE SET NULL,
  "firstName"      VARCHAR(100) NOT NULL,
  "lastName"       VARCHAR(100) NOT NULL,
  "companyName"    VARCHAR(255),
  "abn"            VARCHAR(20),
  "referralCode"   VARCHAR(50) NOT NULL UNIQUE,
  "commissionRate" DECIMAL(5,4) NOT NULL DEFAULT 0.3000,
  "isActive"       BOOLEAN NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "ConsultantInvites" (
  "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "token"      UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  "email"      VARCHAR(255) NOT NULL,
  "firstName"  VARCHAR(100) NOT NULL,
  "lastName"   VARCHAR(100) NOT NULL,
  "expiresAt"  TIMESTAMPTZ NOT NULL,
  "usedAt"     TIMESTAMPTZ,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
