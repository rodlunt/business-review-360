-- Migration 0020: Add primaryOrganizationId to Users (onboarding plan Phase 1)
-- Multi-org users pick a primary org at the every-login picker; this stores
-- the last choice so it pre-selects next login. Holds an org slug, matching
-- the type of Users."organizationId" and UserOrganizationMemberships
-- ."organizationId" (both slug strings, not UUIDs). No hard FK: org identity
-- is slug-based and spans the app/platform DB split, and the value must
-- survive even if a membership is later removed (the picker re-derives).

ALTER TABLE "Users"
  ADD COLUMN IF NOT EXISTS "primaryOrganizationId" VARCHAR(255);
