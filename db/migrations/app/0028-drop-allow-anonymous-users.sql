-- Migration 0028: Drop Organizations.allowAnonymousUsers (#892)
--
-- Vestigial since #892 removed anonymous (email-optional) account creation
-- from both /register and /demo-signup: email is now the sole credential
-- on every registration path, so this org-level toggle has had nothing to
-- gate for some time. Grepping the codebase confirmed it is read/written/
-- echoed by the settings routes and displayed in the admin UI, but never
-- used as a condition anywhere (the copy in GeneralSettingsModal describing
-- "ideas without an email address" describes the separate, still-live
-- Organizations.allowAnonymousIdeas setting, which this migration does not
-- touch). Guest access is replaced by the magic-link flow (PR4) instead.

ALTER TABLE "Organizations"
  DROP COLUMN IF EXISTS "allowAnonymousUsers";
