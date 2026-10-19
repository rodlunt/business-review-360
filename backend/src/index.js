import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Stripe from "stripe";
import { logger, createLogger } from "./utils/logger.js";
import * as Sentry from "@sentry/node";

// Load environment variables first.
// Issue #593: under Jest, backend/jest.setup.js sets NODE_ENV=test and loads
// backend/.env.test before any test module resolves. Skipping the prod-style
// dotenv.config() in that case keeps live secrets out of the test process.
if (process.env.NODE_ENV !== "test") {
  dotenv.config();
  // Secrets bootstrap (#495): SECRETS_PROVIDER=keyvault populates process.env
  // from Azure Key Vault before validateEnvironment() reads it. Default is
  // 'env' which is a no-op (dotenv already ran above).
  const { bootstrap: bootstrapSecrets } = await import("./adapters/secrets/index.js");
  await bootstrapSecrets();
}

// GlitchTip / Sentry error tracking. Initialised after dotenv so SENTRY_DSN is
// available; a no-op when SENTRY_DSN is unset (local/dev). Errors are captured
// explicitly in the central errorHandler and process-level handlers.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "production",
    release: process.env.SENTRY_RELEASE || undefined,
    tracesSampleRate: 0,
    initialScope: { tags: { component: "backend" } },
  });
}

// Validate critical environment variables
const validateEnvironment = () => {
  const required = ["DATABASE_URL", "JWT_SECRET"];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    logger.error(`Missing required environment variables: ${missing.join(", ")}`);
    logger.error("Please check your .env file and ensure all required variables are set.");
    process.exit(1);
  }

  // Validate JWT_SECRET strength
  if (process.env.JWT_SECRET.length < 32) {
    logger.warn("JWT_SECRET should be at least 32 characters long for security.");
  }

  if (
    process.env.JWT_SECRET === "supersecretkey" ||
    process.env.JWT_SECRET === "your-super-secure-jwt-secret-key-change-this-in-production" ||
    process.env.JWT_SECRET === "your-secure-jwt-secret-key"
  ) {
    logger.error("JWT_SECRET is using default value. Please set a secure secret in production.");
    if (process.env.NODE_ENV === "production") {
      process.exit(1);
    }
  }

  logger.info("Environment variables validated successfully");
};

// Validate environment before importing other modules
validateEnvironment();

import {
  publicRouter as authPublicRouter,
  protectedRouter as authProtectedRouter,
} from "./routes/auth.js";
import {
  publicRouter as oauthPublicRouter,
  protectedRouter as oauthProtectedRouter,
} from "./routes/oauth.js";
import { buildResendWebhookHandler } from "./routes/webhooks.js";
import ideaRoutes from "./routes/ideas.js";
import commentRoutes from "./routes/comments.js";
import commentTemplateRoutes from "./routes/commentTemplates.js";
import savedFilterRoutes from "./routes/savedFilters.js";
import voteRoutes from "./routes/votes.js";
import setupRoutes from "./routes/setup.js";
import {
  publicRouter as billingPublicRouter,
  protectedRouter as billingProtectedRouter,
} from "./routes/billing.js";
import {
  publicRouter as contactPublicRouter,
  protectedRouter as contactProtectedRouter,
} from "./routes/contact.js";
import healthRoutes from "./routes/health.js";
import auditRoutes from "./routes/audit.js";

import { syncDb } from "./sync.js";
import { runMigrations } from "./scripts/migrate.js";
import User from "./models/User.js";
import { testConnection } from "./models/index.js";
import { testPlatformConnection } from "./models/platformDatabase.js";

import exportRoutes from "./routes/export.js";
import {
  publicRouter as settingsPublicRouter,
  protectedRouter as settingsProtectedRouter,
} from "./routes/settings.js";
import categoryRoutes from "./routes/categories.js";
import userRoutes from "./routes/users.js";
import analyticsRoutes from "./routes/analytics.js";
import reportsRoutes from "./routes/reports.js";
import aiSettingsRoutes from "./routes/aiSettings.js";
import profanitySettingsRoutes from "./routes/profanitySettings.js";
import notificationsRoutes from "./routes/notifications.js";
import digestRoutes from "./routes/digest.js";
import {
  publicRouter as surveysPublicRouter,
  protectedRouter as surveysProtectedRouter,
} from "./routes/surveys.js";
import emailQueueRoutes from "./routes/emailQueue.js";
import {
  publicRouter as unsubscribePublicRouter,
  protectedRouter as unsubscribeProtectedRouter,
} from "./routes/unsubscribe.js";
import emailAnalyticsRoutes from "./routes/emailAnalytics.js";
import {
  publicRouter as consultantsPublicRouter,
  protectedRouter as consultantsProtectedRouter,
} from "./routes/consultants.js";
import { internalRouter } from "./routes/internal.js";
import path from "path";

// Import digest scheduler (Issue #444)
import { initializeDigestScheduler } from "./jobs/digestScheduler.js";
// Import email queue worker (Issue #747): always-on, no DIGEST_ENABLED gate
import { initializeEmailQueueWorker } from "./jobs/emailQueueWorker.js";
import { initializeAuditLogRetention } from "./jobs/auditLogRetention.js";
import { initializeDemoResetJob } from "./jobs/demoResetJob.js";
// Import commission cron (Issue #808 Phase 3)
import { initializeCommissionJob } from "./jobs/commissionJob.js";
// Import ops metrics cron (Issue #848): EmailQueue depth sampler + retention prune
import { initializeOpsMetricsJob } from "./jobs/opsMetricsJob.js";

// Import security middleware
import {
  securityHeaders,
  sanitizeInput,
  securityLogger,
  rateLimiters,
  ipRestriction,
} from "./middleware/security.js";

// Import tenant resolver middleware (#330)
import { resolveTenant, requireTenant } from "./middleware/tenantResolver.js";

// Import authenticate middleware (#489 - applied at router mount, not per-route)
import { authenticate } from "./middleware/auth.js";

// Import request-level tenant transaction wrapper (#561)
import { wrapTenantTransaction } from "./middleware/wrapTenantTransaction.js";
import { verifyTenantUserMatch } from "./middleware/verifyTenantUserMatch.js";

// Import request ID middleware (#334)
import { requestIdMiddleware, requestLoggingMiddleware } from "./middleware/requestId.js";

// Import error handling middleware (#335)
import {
  errorHandler,
  notFoundHandler,
  setupProcessErrorHandlers,
} from "./middleware/errorHandler.js";
import { notifyError } from "./utils/ntfy.js";

// Import audit logging middleware (#338, #127)
import { supportMode } from "./middleware/auditLog.js";

// Setup process-level error handlers (#335)
setupProcessErrorHandlers();

const app = express();

// Trust the first proxy hop (nginx) so req.ip reflects the real client
app.set("trust proxy", 1);

// Stripe webhook MUST be registered FIRST, before ANY other middleware
// This ensures req.body remains as raw Buffer for signature verification
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Import webhook processor dynamically to avoid circular dependencies
let processWebhookEvent;
import("./routes/billing.js").then((module) => {
  processWebhookEvent = module.processWebhookEvent;
});

app.post("/api/billing/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    logger.error("[Billing] STRIPE_WEBHOOK_SECRET not configured");
    return res.status(500).json({ error: "Webhook not configured" });
  }

  let event;

  try {
    // Verify webhook signature with raw body
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    createLogger(req).info(`[Billing] Webhook received and verified: ${event.type} (${event.id})`);

    // Process the event using billing module
    if (processWebhookEvent) {
      const result = await processWebhookEvent(event);
      return res.json(result);
    } else {
      logger.error("[Billing] Webhook processor not loaded yet");
      return res.status(500).json({ error: "Webhook processor not ready" });
    }
  } catch (err) {
    createLogger(req).error(`[Billing] Webhook error`, err);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }
});

// Resend webhook (Issue #572). Like the Stripe webhook above, this MUST be
// registered BEFORE express.json() so req.body remains a raw Buffer for
// Svix HMAC signature verification. The handler lives in routes/webhooks.js;
// we mount it directly on app rather than via a sub-router so the raw-body
// parser stays scoped to this single route.
app.post(
  "/api/webhooks/resend",
  express.raw({ type: "application/json" }),
  buildResendWebhookHandler()
);

// IP restriction middleware (applied first for security)
app.use(ipRestriction.strict);

// Request ID middleware (Issue #334) - Add early for logging correlation
app.use(requestIdMiddleware);

// Request logging middleware (Issue #334) - Optional, controlled by env var
if (process.env.LOG_HTTP_REQUESTS === "true") {
  app.use(requestLoggingMiddleware);
}

// Enhanced security headers
app.use(securityHeaders());
// CORS configuration - handle preflight as early as possible
const baseDomain = process.env.BASE_DOMAIN || "br360.example.com";
const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
const corsOptions = {
  origin: (origin, callback) => {
    const isProd = process.env.NODE_ENV === "production";
    // In production, only accept https:// origins to prevent credential leakage
    // over plain HTTP (relevant for subdomain origins with credentials: true).
    const isAllowedScheme = (o) => !isProd || o.startsWith("https://");
    if (
      !origin ||
      origin === frontendUrl ||
      (origin === `https://${baseDomain}` && isAllowedScheme(origin)) ||
      (origin === `http://${baseDomain}` && isAllowedScheme(origin)) ||
      (origin.endsWith("." + baseDomain) && isAllowedScheme(origin))
    ) {
      callback(null, true);
    } else {
      callback(new Error("CORS: origin not allowed"));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  // Allow the custom X-Client-Id header so browsers can send a stable client id
  allowedHeaders: "Content-Type,Authorization,X-Client-Id,X-Requested-With",
  // Expose rate-limit headers to the browser for debugging and UI hints
  exposedHeaders: [
    "X-RateLimit-Limit",
    "X-RateLimit-Remaining",
    "X-RateLimit-Reset",
    "Retry-After",
  ],
  credentials: true,
  maxAge: 86400, // cache preflight requests for 1 day
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));

// Parse JSON bodies BEFORE sanitization
app.use(express.json({ limit: "1mb" })); // Limit request size

// Security logging
app.use(securityLogger);

// Input sanitization
app.use(sanitizeInput);

// Rate limiting for all requests
// In production apply the global API limiter. In development, skip the global
// limiter for settings and categories to avoid Docker/IP coalescing causing
// accidental 429s while debugging the admin UI.
// Rate limiting for all requests
// Only enable global API rate limiting in production unless explicitly overridden.
const disableRate =
  process.env.DISABLE_RATE_LIMIT === "true" || process.env.DISABLE_RATE_LIMIT === "1";
if (process.env.NODE_ENV === "production" && !disableRate) {
  app.use(rateLimiters.api);
} else {
  // No global limiter in development or when disabled via env var
  app.use((req, res, next) => next());
}

// Serve uploaded files (logo)
// Ensure uploaded assets can be loaded from the frontend origin (different port)
// by setting Cross-Origin-Resource-Policy to allow cross-origin embedding.
const uploadsPath = path.join(process.cwd(), "uploads");
app.use(
  "/uploads",
  (req, res, next) => {
    // Allow the browser to load images from this origin into other origins
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  express.static(uploadsPath)
);

// Serve static seed/fixture assets (tracked in git, not user uploads).
// Mounted at /api/assets rather than /assets to avoid conflicting with
// nginx's /assets location block (which serves Vite-generated React app assets).
const assetsPath = path.join(process.cwd(), "assets");
app.use(
  "/api/assets",
  (req, res, next) => {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  express.static(assetsPath)
);

// Respond to preflight OPTIONS requests for uploads with proper CORS headers
app.options(/^\/uploads\/.*$/, (req, res) => {
  const origin = req.get("Origin") || process.env.FRONTEND_URL || "http://localhost:3000";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.status(204).send();
});

// Initialize server function with database connection retry
const initializeServer = async () => {
  try {
    // Try to connect to the application database with retries
    logger.info("Connecting to application database...");
    await testConnection(10, 3000); // 10 attempts, 3 seconds between attempts

    // Try to connect to the platform database (#330)
    logger.info("Connecting to platform database...");
    await testPlatformConnection(10, 3000);

    // Run pending SQL migrations (#584) before Sequelize sync
    await runMigrations(process.env.DATABASE_URL);

    // After successful connection, sync database and check for admin
    await syncDb(false);

    const adminCount = await User.count({ where: { isAdmin: true } });
    if (adminCount === 0) {
      logger.info("No admin user found. Superuser setup required.");
    }

    // Start setting up routes after DB connection is established
    registerRoutes();
    startServer();
  } catch (error) {
    logger.error("Failed to initialize server", error);
    process.exit(1); // Exit with error
  }
};
// (removed: now handled in setupRoutes)

// Function to setup routes
const registerRoutes = () => {
  logger.info("Registering routes...");

  // Platform-wide setup check. Register before the global /api tenant
  // resolver so a browser's stored organizationId cannot force this endpoint
  // through tenant RLS/role switching after visiting an org landing page.
  app.get("/api/setup/superuser-required", async (req, res) => {
    const adminCount = await User.count({ where: { isAdmin: true } });
    res.json({ superuserRequired: adminCount === 0 });
  });

  // Apply tenant resolver middleware to ALL API routes EXCEPT public routes
  // that establish context themselves or never need tenant context (#330).
  app.use("/api", (req, res, next) => {
    // Skip tenant resolution for endpoints that don't require tenant context
    // Note: req.path has already had "/api" stripped by Express, so we check for "/auth/*"
    if (
      req.path === "/auth/login" ||
      req.path === "/auth/register" ||
      req.path === "/auth/setup-superuser" ||
      req.path === "/auth/request-password-reset" ||
      req.path === "/auth/recover" ||
      req.path === "/auth/reset-password" ||
      req.path === "/auth/magic-link" ||
      req.path === "/auth/magic-link/redeem" ||
      req.path.startsWith("/auth/oauth/") || // OAuth callbacks carry orgId in state JWT
      req.path === "/client-error"
    ) {
      createLogger(req).debug(
        `[Tenant Resolver] Skipping tenant resolution for public endpoint: ${req.path}`
      );
      return next();
    }
    // All other routes go through tenant resolution
    return resolveTenant(req, res, next);
  });
  logger.info("Tenant resolver middleware registered (with auth endpoint exclusions)");

  // Apply support mode middleware (Issue #338)
  // Logs support user access and restricts write operations
  app.use("/api", supportMode);
  logger.info("Support mode middleware registered");

  // Issue #751: cross-tenant guard runs BEFORE wrapTenantTransaction so
  // the role-switch / RLS scope hasn't been applied yet. JWT-only check
  // (no DB call), no-op when req.tenant is absent or no token is present.
  app.use("/api", verifyTenantUserMatch);
  logger.info("verifyTenantUserMatch registered");

  // Issue #740: wrapTenantTransaction registered globally on /api.
  // Promoted from the per-route opt-in pattern (#561 Phase 2) once cron and
  // service callers got the parallel withTenantContext helper. The wrapper
  // is a no-op when !req.tenant (auth, signup, public flows that
  // resolveTenant already skipped), so no allowlist is needed: every
  // request that reached resolveTenant and got a tenant assigned now
  // enforces RLS via SET LOCAL app.tenant_id inside its own transaction.
  app.use("/api", wrapTenantTransaction);
  logger.info("wrapTenantTransaction registered (global: /api)");

  // Block mutating requests for trial-expired tenants (#531).
  // GET/HEAD/OPTIONS are allowed so users can still read their data.
  // Billing paths that complete the upgrade must be exempt: a trial-expired
  // user cannot reach the Stripe portal or checkout to pay if the gate fires
  // before those handlers run.
  const TRIAL_EXPIRY_EXEMPT = ["/billing/customer-portal", "/billing/checkout"];
  app.use("/api", (req, res, next) => {
    if (
      req.tenant?.trialExpired &&
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      !TRIAL_EXPIRY_EXEMPT.some((p) => req.path.startsWith(p))
    ) {
      return res.status(403).json({
        error: "Your free trial has expired. Please upgrade to continue.",
        code: "TRIAL_EXPIRED",
        trialEndsAt: req.tenant.trialEndsAt,
        upgradeUrl: `/pricing`,
      });
    }
    next();
  });

  // Enhanced rate limiting and IP restrictions for authentication endpoints
  // Phase 5 (5a, #858): the org-less login path additionally gets a
  // per-email limiter. It engages only when organizationId is absent so
  // the hardened org-scoped path keeps exactly its previous limiter
  // surface (IP-keyed rateLimiters.auth). Both limiters stack on the
  // org-less path: IP (spray across accounts) + email (guessing one
  // account). express.json() is registered above (line ~267) so req.body
  // is available to the wrapper and the email key generator.
  app.use("/api/auth/login", ipRestriction.auth, rateLimiters.auth, (req, res, next) => {
    if (req.body && !req.body.organizationId) {
      return rateLimiters.emailLogin(req, res, next);
    }
    return next();
  });
  app.use("/api/auth/register", ipRestriction.auth, rateLimiters.auth);
  // Phase 5 (#892): provider discovery for the unified login UX. Same
  // posture as /api/auth/register: IP-keyed auth limiter (20 req / 15
  // min). The endpoint is enumeration-safe by response shape (see
  // routes/auth.js); the limiter is a defence-in-depth cap on probing.
  app.use("/api/auth/discover-providers", ipRestriction.auth, rateLimiters.auth);
  app.use("/api/auth/request-password-reset", ipRestriction.auth, rateLimiters.passwordReset);
  app.use("/api/auth/recover", ipRestriction.auth, rateLimiters.passwordReset);
  app.use("/api/auth/reset-password", ipRestriction.auth, rateLimiters.passwordReset);
  // #892: magic-link guest access. Same limiter tier as password reset --
  // both are token-issue/token-consume pairs with an identical abuse
  // profile (spray requests, guess tokens). Express matches app.use() by
  // path PREFIX, so this single mount covers both POST /magic-link and
  // POST /magic-link/redeem; a second explicit mount for /redeem would
  // double-apply the limiter to every redeem request.
  app.use("/api/auth/magic-link", ipRestriction.auth, rateLimiters.passwordReset);
  app.use("/api/auth", authPublicRouter);
  // OAuth public routes (initiation + callback) must be before the authenticate
  // middleware below, otherwise /api/auth/* authenticate intercepts them first.
  app.use("/api/auth/oauth", oauthPublicRouter);
  app.use("/api/auth", authenticate, authProtectedRouter);
  app.use("/api/auth/oauth", oauthProtectedRouter);
  logger.info("Auth + OAuth routes registered");

  // Billing routes (public - no auth required for checkout)
  app.use("/api/billing", billingPublicRouter);
  app.use("/api/billing", authenticate, billingProtectedRouter);
  logger.info("Billing routes registered");

  // Contact routes (public - no auth required for sales enquiries)
  // Auth-tier limiter prevents bot spam against the sales inbox + sales_enquiries table
  app.use("/api/contact", rateLimiters.auth, contactPublicRouter);
  app.use("/api/contact", rateLimiters.auth, authenticate, contactProtectedRouter);
  logger.info("Contact routes registered");

  // Apply specific rate limiting for ideas endpoint
  // requireTenant ensures tenant context is set (most data routes need this)
  // authenticate runs at the mount level so route handlers stay clean (#489)
  app.use("/api/ideas", rateLimiters.ideas, requireTenant);
  app.use("/api/ideas", authenticate, ideaRoutes);
  logger.info("Ideas routes registered");

  app.use("/api/comments", requireTenant, authenticate, commentRoutes);
  logger.info("Comments routes registered");

  app.use("/api/comment-templates", requireTenant, authenticate, commentTemplateRoutes);
  logger.info("Comment template routes registered");

  app.use("/api/saved-filters", requireTenant, authenticate, savedFilterRoutes);
  logger.info("Saved filter routes registered");

  app.use("/api/votes", requireTenant, authenticate, voteRoutes);

  // Admin routes with IP restrictions
  app.use("/api/export", ipRestriction.admin, requireTenant, authenticate, exportRoutes);
  app.use("/api/analytics", ipRestriction.admin, requireTenant, authenticate, analyticsRoutes);
  app.use("/api/reports", ipRestriction.admin, requireTenant, authenticate, reportsRoutes);
  app.use("/api/ai-settings", ipRestriction.admin, requireTenant, authenticate, aiSettingsRoutes);
  // Issue #505: apply resolveTenant at the mount so tenant context (RLS) is
  // established wherever an organizationId is supplied, without rejecting the
  // deliberately-public landing-page endpoint. Matches the pattern used for
  // /api/setup. resolveTenant is permissive: it only rejects when an explicit
  // organizationId is given and the tenant is missing/inactive.
  app.use("/api/settings", resolveTenant, settingsPublicRouter);
  app.use("/api/settings", resolveTenant, authenticate, settingsProtectedRouter);
  app.use("/api/categories", requireTenant, authenticate, categoryRoutes);
  app.use("/api/users", ipRestriction.admin, requireTenant, authenticate, userRoutes);
  app.use("/api/setup", resolveTenant, setupRoutes); // Apply tenant resolver for multi-tenant support
  app.use("/api/profanity-settings", requireTenant, authenticate, profanitySettingsRoutes);

  // Notification preferences and subscriptions (Issue #443)
  app.use("/api/notifications", requireTenant, authenticate, notificationsRoutes);
  logger.info("Notifications routes registered");

  // Digest email routes (Issue #444)
  app.use("/api/digest", requireTenant, authenticate, digestRoutes);
  logger.info("Digest routes registered");

  // Survey routes (Issue #445) - Note: quick-rate endpoint is public (uses token)
  app.use("/api/surveys", surveysPublicRouter);
  app.use("/api/surveys", authenticate, surveysProtectedRouter);
  logger.info("Survey routes registered");

  // Email queue admin routes (Issue #446)
  app.use("/api/admin/email-queue", requireTenant, authenticate, emailQueueRoutes);
  logger.info("Email queue routes registered");

  // Unsubscribe routes (Issue #447) - Note: public endpoints for CAN-SPAM compliance
  app.use("/api/unsubscribe", unsubscribePublicRouter);
  app.use("/api/unsubscribe", authenticate, unsubscribeProtectedRouter);
  logger.info("Unsubscribe routes registered");

  // Email analytics routes (Issue #448) - Admin only
  app.use("/api/admin/email-analytics", requireTenant, authenticate, emailAnalyticsRoutes);
  logger.info("Email analytics routes registered");

  // Audit log routes (Issues #338, #127) - Admin only
  app.use("/api/audit", ipRestriction.admin, authenticate, auditRoutes);
  logger.info("Audit log routes registered");

  // Consultant routes (Issue #808) - platform-level, no tenant context
  // Public routes: invite token lookup + signup. Protected routes: invite send + list + update.
  app.use("/api/consultants", consultantsPublicRouter);
  app.use("/api/consultants", authenticate, consultantsProtectedRouter);
  logger.info("Consultant routes registered");

  // Internal admin routes (Issue #808 Phase 3 + admin console migration)
  // Requires authenticate (JWT); isSuperuser is checked inside internalRouter.
  app.use("/api/internal", authenticate, internalRouter);
  logger.info("Internal admin routes registered (/api/internal)");

  // Health check routes (Issue #336)
  app.use("/health", healthRoutes);
  logger.info("Health check routes registered");

  // Frontend error relay: receives unhandled JS errors from the React app
  // and forwards them to ntfy. Public (no auth) but tightly rate-limited so it
  // cannot be abused as a spam relay. Silently accepts when NTFY_URL is unset.
  const clientErrorLimiter = rateLimiters.auth; // 20 req / 15 min per IP; reuse auth tier
  app.post("/api/client-error", clientErrorLimiter, async (req, res) => {
    const { message, stack, url, type } = req.body ?? {};
    if (message && typeof message === "string") {
      const logger = createLogger(req);
      logger.info(
        { message, stack: stack?.slice(0, 800), url, type },
        "[ClientError] Frontend error received"
      );
      const title = `[BR360 Frontend] ${String(type || "Error").slice(0, 60)}: ${message.slice(0, 120)}`;
      const body = [
        `URL: ${url || "(unknown)"}`,
        "",
        stack ? String(stack).slice(0, 800) : "(no stack)",
      ].join("\n");
      notifyError(title, body).catch(() => {});
    }
    res.status(204).end();
  });

  // Catch-all 404 handler for undefined API routes (returns JSON) - MUST be registered AFTER all routes
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) {
      return res.status(404).json({ error: "API route not found" });
    }
    next();
  });

  logger.info("All routes registered successfully");

  // 404 Not Found handler - must be AFTER all routes (#335)
  app.use(notFoundHandler);

  // Centralized error handler - must be LAST (#335)
  app.use(errorHandler);
};

// Function to start server
const startServer = () => {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, async () => {
    logger.info(`Backend running on port ${PORT}`);

    // Initialize email queue worker (Issue #747): always-on, must register
    // before digest scheduler so transactional sends drain regardless of
    // DIGEST_ENABLED.
    await initializeEmailQueueWorker();
    // Initialize digest email scheduler (Issue #444)
    initializeDigestScheduler();
    initializeAuditLogRetention();
    initializeDemoResetJob();
    // Initialize monthly commission cron (Issue #808 Phase 3)
    initializeCommissionJob();
    // Initialize ops metrics sampler + prune cron (Issue #848)
    initializeOpsMetricsJob();
  });
};

// Note: Routes are registered in the registerRoutes() function called during initialization

// Call the initialization function to start the server

initializeServer().catch((err) => {
  logger.error("Failed to start server", err);
  process.exit(1);
});
