-- Migration 0029: Add MagicLinkTokens table (#892)
--
-- Server-side single-use record for magic-link guest access, the
-- REAL-ROWS replacement for the removed anonymous account mode: redeeming
-- a link ensures a real User row + a demo-corp membership (see
-- routes/auth.js POST /auth/magic-link and /auth/magic-link/redeem).
--
-- The bearer token itself is a short-lived (15 min), purpose-bound HS256
-- JWT (payload: { email, purpose: 'magic-link' }, jti claim) -- the same
-- purpose-bound-JWT family as the existing org-pick token. A JWT alone is
-- not single-use, so this table is the consumed-record redeem checks
-- against, keyed by jti rather than by userId: no User row is guaranteed
-- to exist yet for the email at send time (redemption creates one if
-- missing), so the reset-password pattern of storing the token directly
-- on the Users row (passwordResetToken/passwordResetExpires) does not
-- apply here.

CREATE TABLE IF NOT EXISTS "MagicLinkTokens" (
  "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "jti"        UUID NOT NULL UNIQUE,
  "email"      VARCHAR(255) NOT NULL,
  "expiresAt"  TIMESTAMPTZ NOT NULL,
  "consumedAt" TIMESTAMPTZ,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_magiclinktokens_email" ON "MagicLinkTokens" ("email");
