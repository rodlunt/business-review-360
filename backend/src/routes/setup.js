import express from "express";
import User from "../models/User.js";
import Organization from "../models/Organization.js";
import { resetTestDatabase } from "../lib/resetTestDatabase.js";
import { testResetEndpointsAllowed, getTestResetToken } from "../lib/testResetToken.js";
import { formatServerError } from "../utils/formatServerError.js";
import { logAuditEvent, redactForAudit } from "../middleware/auditLog.js";
import { logger } from "../utils/logger.js";
import { hashPassword } from "../utils/passwordHash.js";

logger.info("[Setup] ===== SETUP ROUTES MODULE LOADING =====");

const router = express.Router();

logger.info("[Setup] Router created successfully");

// TEMPORARY: Always show superuser form for UI testing
router.get("/force-superuser-form", (req, res) => {
  res.json({ superuserRequired: true });
});

// TEST: Simple endpoint to verify routing works
router.get("/test", (req, res) => {
  logger.info("[Setup] TEST endpoint called");
  res.json({ message: "Setup routes are working!" });
});

// Issue #544: the destructive /reset-database endpoint is only mounted when
// ALLOW_DESTRUCTIVE_TEST_ENDPOINTS=true AND NODE_ENV !== 'production'. When
// either condition fails the route does not exist at all (404, not 403), so
// it cannot leak even a fingerprint in production. A per-boot bearer token
// adds defence in depth for test boxes where the flag is deliberately set.
if (testResetEndpointsAllowed()) {
  const expectedToken = getTestResetToken();
  logger.info("[Setup] Test reset endpoint enabled. Token written to backend/.test-reset-token");

  router.post("/reset-database", async (req, res) => {
    const providedToken = req.get("X-Test-Reset-Token");
    if (!providedToken || providedToken !== expectedToken) {
      return res.status(401).json({ error: "Invalid or missing test reset token" });
    }

    const beforeCounts = {
      users: await User.count(),
      organizations: await Organization.count(),
    };
    try {
      await logAuditEvent(req, {
        action: "setup.database.reset",
        resourceType: "platform",
        metadata: {
          rows_before: beforeCounts,
          triggered_by: "test-token",
        },
        status: "success",
      });
      await resetTestDatabase();
      res.json({ success: true, message: "Test database wiped" });
    } catch (err) {
      await logAuditEvent(req, {
        action: "setup.database.reset",
        resourceType: "platform",
        metadata: {
          rows_before: beforeCounts,
          triggered_by: "test-token",
          error: err.message,
        },
        status: "failure",
      });
      logger.error("[Setup] reset-database failed:", err.message);
      res.status(500).json({ error: "Reset failed" });
    }
  });
}

// Check if superuser is required (no admin users exist)
router.get("/superuser-required", async (req, res) => {
  try {
    const adminCount = await User.count({ where: { isAdmin: true } });
    res.json({ superuserRequired: adminCount === 0 });
  } catch {
    res.status(500).json({ error: "Failed to check superuser status" });
  }
});

// Create superuser (first-time setup)
// This endpoint now expects organizationId in the request body
// The tenant resolver middleware will set the tenant context for RLS
router.post("/create-superuser", async (req, res) => {
  // Issue #475: do NOT log req.body or req.headers here. The body contains
  // the plaintext password; the headers may contain Authorization bearers or
  // session cookies. If diagnostics are needed later, log the specific
  // non-sensitive fields (username, email, organizationId) explicitly.
  logger.info("[Setup] create-superuser endpoint called");

  const { username, password, email, organizationId } = req.body;

  if (!username || !password || !email) {
    logger.info("[Setup] Missing required fields");
    return res.status(400).json({ error: "Username, password, and email are required" });
  }

  if (!organizationId) {
    logger.info("[Setup] Missing organizationId");
    return res.status(400).json({ error: "Organization ID is required" });
  }

  try {
    // Issue #597: refuse globally once any admin exists. The sibling
    // GET /superuser-required uses the same query to advertise whether
    // first-time setup is still open. Without this guard, an attacker
    // who reaches POST /create-superuser after initial setup could mint
    // a fresh superuser (in a new tenant or otherwise) and hijack access.
    const existingAdminCount = await User.count({ where: { isAdmin: true } });
    if (existingAdminCount > 0) {
      return res.status(403).json({
        error: "Superuser setup is locked: an admin already exists.",
        code: "SUPERUSER_ALREADY_EXISTS",
      });
    }

    logger.info(
      `[Setup] Creating superuser for tenant: ${req.tenant?.tenant_name || organizationId}`
    );

    // Check if tenant context was set by middleware
    if (!req.tenant) {
      logger.error("[Setup] No tenant context - tenant resolver middleware may not be applied");
      return res.status(400).json({
        error: "Organization context required",
        code: "TENANT_REQUIRED",
      });
    }

    // Create superuser with organizationId and tenant_id
    const hash = await hashPassword(password);
    logger.info("[Setup] About to create user");

    // Check if any admin exists for this tenant (use explicit tenant_id filter)
    const adminCount = await User.count({
      where: {
        isAdmin: true,
        tenant_id: req.tenant.id,
      },
    });

    // Debug: write to response for visibility
    if (adminCount > 0) {
      return res.status(403).json({
        error: "Superuser already exists",
        debug: {
          adminCount,
          tenantId: req.tenant.id,
          organizationId: organizationId,
        },
      });
    }

    // Check for existing username/email for this tenant
    const existingUser = await User.findOne({
      where: {
        username,
        tenant_id: req.tenant.id,
      },
    });
    if (existingUser) {
      return res.status(409).json({ error: "Username already exists" });
    }

    const existingEmail = await User.findOne({
      where: {
        email,
        tenant_id: req.tenant.id,
      },
    });
    if (existingEmail) {
      return res.status(409).json({ error: "Email already in use" });
    }

    // Create the user directly with Sequelize, explicitly setting tenant_id
    // RLS policies will allow this because we're setting the tenant_id field explicitly
    const user = await User.create({
      username,
      passwordHash: hash,
      email,
      isAdmin: true,
      isAnonymous: false,
      organizationId: organizationId,
      tenant_id: req.tenant.id,
    });

    logger.info(`[Setup] Superuser created successfully: ${user.username} (${user.id})`);

    await logAuditEvent(req, {
      action: "setup.superuser.create",
      resourceType: "user",
      resourceId: user.id,
      changes: { before: null, after: redactForAudit(user.toJSON()) },
      status: "success",
    });

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        isAdmin: user.isAdmin,
      },
    });
  } catch (err) {
    await logAuditEvent(req, {
      action: "setup.superuser.create",
      resourceType: "user",
      changes: { before: null, after: null },
      status: "failure",
      metadata: { error: err.message },
    });
    // Issue #545 sweep: drop err.message from the response.
    res
      .status(500)
      .json(
        formatServerError(err, "Failed to create superuser", "[Setup] Error creating superuser:")
      );
  }
});

export default router;
