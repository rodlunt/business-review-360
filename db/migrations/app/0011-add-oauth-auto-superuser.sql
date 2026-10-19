-- When oauthAutoSuperuser is true, any new user created via OAuth is granted
-- isSuperuser access automatically. Intended for demo orgs where visitors
-- should experience the full admin view.

ALTER TABLE "Organizations" ADD COLUMN IF NOT EXISTS "oauthAutoSuperuser" BOOLEAN NOT NULL DEFAULT false;
