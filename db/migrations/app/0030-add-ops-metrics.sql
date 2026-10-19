-- Migration 0030: Add ErrorEvents and MetricsSamples tables (#848)
--
-- Minimal ops dashboard (error rate + email-queue depth over time) for the
-- internal admin console. Deferred out of #815, which delivered alerting;
-- this table pair delivers the historical-visibility criterion only.
--
-- ErrorEvents deliberately carries NO error messages, stack traces, user
-- ids or request bodies. It only feeds hourly count buckets; the detailed
-- record (message, stack, PII) stays in GlitchTip/Sentry, which already
-- receives every 5xx via Sentry.captureException in errorHandler.js. This
-- keeps the table cheap to keep and safe to retain, since it holds nothing
-- worth protecting beyond a status code and a route shape.
--
-- MetricsSamples is a periodic point-in-time snapshot of EmailQueue depth
-- (pending/failed counts), written by the opsMetricsService sampler every
-- five minutes. Both tables are pruned to a 90-day retention window by the
-- same service (see opsMetricsService.js pruneOpsMetrics).
--
-- Both tables live only in the Postgres app database already provisioned
-- for BR360 -- no new on-disk or in-process state is added to the backend
-- containers themselves, so this satisfies the Azure Container Apps
-- portability requirement in #848 (a managed Postgres instance carries the
-- same tables over unchanged).

CREATE TABLE IF NOT EXISTS "ErrorEvents" (
  "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "statusCode" INTEGER,
  "route"      VARCHAR(255),
  "errorName"  VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS "idx_errorevents_createdat" ON "ErrorEvents" ("createdAt");

CREATE TABLE IF NOT EXISTS "MetricsSamples" (
  "id"                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "sampledAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "emailQueuePending" INTEGER,
  "emailQueueFailed"  INTEGER
);

CREATE INDEX IF NOT EXISTS "idx_metricssamples_sampledat" ON "MetricsSamples" ("sampledAt");
