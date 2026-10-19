-- Migration 0023: Add Users.signupSource
-- Phase 5 follow-up (#892, 2026-05-23): tag each new User row with how the
-- account was created so platform-owner follow-up (re-engagement, lead
-- outreach) can segment by source. Captured at User.create; never mutated.
--
-- Values:
--   legacy              backfilled for all existing rows
--   invite              org-scoped registration (admin sent the user to an
--                       org subdomain register URL with organizationId)
--   demo-signup         org-less self-serve registration (today defaults to
--                       the shared self-serve org, e.g. demo-corp)
--   oauth-self-register existing OAuth callback created the User (org-scoped
--                       OAuth landing on an enabled-self-registration org)
--   paid-signup         reserved for the subscription-driven org creation
--                       flow (future PR)
--   oauth-no-org        reserved for the main-domain OAuth no-org flow
--                       (future PR)
--   magic-link          account created (or reused) by redeeming a
--                       magic-link guest-access token (#892 PR4);
--                       migration 0029-add-magic-link-tokens.sql
--
-- NOT RLS-protected: it is an annotation column on Users, same posture as
-- referredByConsultantCode. Idempotent column add + idempotent backfill so
-- the migration is safe to re-run.

ALTER TABLE "Users"
  ADD COLUMN IF NOT EXISTS "signupSource" VARCHAR(32);

UPDATE "Users"
   SET "signupSource" = 'legacy'
 WHERE "signupSource" IS NULL;
