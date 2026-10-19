-- Issue #740: create constrained APP_DB_ROLE for runtime route requests.
--
-- Routes wrap each request in a transaction that does
-- `SET LOCAL ROLE br360_app_user` before any user-data query, so RLS
-- policies (FORCE ROW LEVEL SECURITY on Users/Ideas/Comments/Votes/
-- CommentVotes/Categories) actually enforce. The privileged login user
-- (business_review_user_0001) keeps SUPERUSER+BYPASSRLS so cron jobs and
-- admin paths continue to iterate across tenants without per-loop
-- SET app.tenant_id boilerplate.
--
-- Idempotent: safe to re-run.
--
-- Apply BEFORE setting APP_DB_ROLE in server .env. Order:
--   1. ssh your-server 'docker exec -i ... psql ...' < db/patches/740-app-db-role.sql
--   2. set APP_DB_ROLE=br360_app_user in /path/to/business-review-360/.env
--   3. cd /path/to/business-review-360 && docker compose up -d backend
--      (NOT plain `docker restart` -- env file changes only take effect on up,
--      per CLAUDE.md operational gotcha #7)
--   4. Verify: ssh your-server and exercise a wrapped route, plus the cross-tenant
--      query test from #740's body should now return 0 rows.
--
-- Rollback: unset APP_DB_ROLE in .env and `docker compose up -d backend`.
-- The role itself can stay; without APP_DB_ROLE set, the wrapper never
-- references it.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'br360_app_user') THEN
        CREATE ROLE br360_app_user NOSUPERUSER NOBYPASSRLS NOLOGIN INHERIT;
    END IF;
END
$$;

-- Grant the privileged login user membership in br360_app_user so
-- SET ROLE works inside the wrapped transaction. INHERIT on br360_app_user
-- means the privileged user picks up its grants automatically; SET ROLE
-- swaps the *current_user* identifier (which is what RLS checks) without
-- losing access.
GRANT br360_app_user TO business_review_user_0001;

-- Schema and table grants. Tables are owned by business_review_user_0001;
-- br360_app_user needs explicit GRANTs to operate on them.
GRANT USAGE ON SCHEMA public TO br360_app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO br360_app_user;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO br360_app_user;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO br360_app_user;

-- Future tables created by business_review_user_0001 inherit these grants
-- automatically, so new schema patches do not need to remember the role.
ALTER DEFAULT PRIVILEGES FOR ROLE business_review_user_0001 IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO br360_app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE business_review_user_0001 IN SCHEMA public
    GRANT USAGE ON SEQUENCES TO br360_app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE business_review_user_0001 IN SCHEMA public
    GRANT EXECUTE ON FUNCTIONS TO br360_app_user;
