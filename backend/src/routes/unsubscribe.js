/**
 * Unsubscribe Routes
 *
 * API endpoints for email unsubscribe functionality.
 * Most endpoints are public (no auth required) to comply with CAN-SPAM.
 *
 * Issue #447: Unsubscribe system implementation
 */

import express from "express";
import {
  validateToken,
  processUnsubscribe,
  processResubscribe,
  getTypeDisplayName,
} from "../services/unsubscribeService.js";
import IdeaSubscription from "../models/IdeaSubscription.js";
import NotificationPreferences from "../models/NotificationPreferences.js";
import { logger } from "../utils/logger.js";

// #720: split into public + protected sub-routers so this file no longer
// imports `authenticate` directly. authenticate is mounted in index.js
// on the protected router. Public token-based routes (CAN-SPAM compliance)
// live on the public router.
export const publicRouter = express.Router();
export const protectedRouter = express.Router();

// Tokens are crypto.randomBytes(32).toString('base64url'): 43 chars of [A-Za-z0-9_-].
// Reject anything that doesn't match before hitting the DB to avoid 500s on malformed input.
const VALID_TOKEN_RE = /^[A-Za-z0-9_-]{43,44}$/;
const isValidToken = (t) => VALID_TOKEN_RE.test(t);

/**
 * GET /api/unsubscribe/:token
 * Get information about what will be unsubscribed (for landing page)
 * Public endpoint - no auth required for CAN-SPAM compliance
 */
publicRouter.get("/:token", async (req, res) => {
  try {
    const { token } = req.params;
    if (!isValidToken(token)) {
      return res.status(400).json({ valid: false, error: "Invalid token" });
    }
    const validation = await validateToken(token);

    if (!validation.valid) {
      return res.status(validation.alreadyUnsubscribed ? 200 : 400).json({
        valid: false,
        error: validation.error,
        alreadyUnsubscribed: validation.alreadyUnsubscribed || false,
        unsubscribedAt: validation.unsubscribedAt,
      });
    }

    res.json({
      valid: true,
      type: validation.type,
      description: validation.description,
      typeName: getTypeDisplayName(validation.type),
      ideaId: validation.ideaId,
      ideaTitle: validation.ideaTitle,
      // Don't expose full user data, just enough for confirmation
      email: validation.user?.email ? maskEmail(validation.user.email) : null,
    });
  } catch (error) {
    logger.error("[Unsubscribe] Validation error:", error);
    res.status(500).json({ error: "Failed to validate token" });
  }
});

/**
 * POST /api/unsubscribe/:token
 * Process the unsubscribe action
 * Public endpoint - no auth required for CAN-SPAM compliance
 */
publicRouter.post("/:token", async (req, res) => {
  try {
    const { token } = req.params;
    if (!isValidToken(token)) {
      return res.status(400).json({ success: false, error: "Invalid token" });
    }
    const result = await processUnsubscribe(token);

    if (!result.success && result.error) {
      return res.status(result.alreadyUnsubscribed ? 200 : 400).json(result);
    }

    res.json({
      success: true,
      message: `Successfully unsubscribed from ${result.description}`,
      type: result.type,
      description: result.description,
    });
  } catch (error) {
    logger.error("[Unsubscribe] Process error:", error);
    res.status(500).json({ error: "Failed to process unsubscribe" });
  }
});

/**
 * POST /api/unsubscribe/:token/resubscribe
 * Resubscribe using the same token
 * Public endpoint - no auth required
 */
publicRouter.post("/:token/resubscribe", async (req, res) => {
  try {
    const { token } = req.params;
    if (!isValidToken(token)) {
      return res.status(400).json({ success: false, error: "Invalid token" });
    }
    const result = await processResubscribe(token);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json({
      success: true,
      message: `Successfully ${result.description}`,
      type: result.type,
    });
  } catch (error) {
    logger.error("[Unsubscribe] Resubscribe error:", error);
    res.status(500).json({ error: "Failed to process resubscribe" });
  }
});

/**
 * POST /api/unsubscribe/idea/:ideaId
 * Unsubscribe from a specific idea (authenticated)
 */
protectedRouter.post("/idea/:ideaId", async (req, res) => {
  try {
    const { ideaId } = req.params;
    const userId = req.user.id;

    const [subscription, created] = await IdeaSubscription.findOrCreate({
      where: { userId, ideaId },
      defaults: { userId, ideaId, subscribed: false },
    });

    if (!created) {
      await subscription.update({ subscribed: false });
    }

    res.json({
      success: true,
      message: "Unsubscribed from idea notifications",
      ideaId,
    });
  } catch (error) {
    logger.error("[Unsubscribe] Idea unsubscribe error:", error);
    res.status(500).json({ error: "Failed to unsubscribe from idea" });
  }
});

/**
 * POST /api/unsubscribe/idea/:ideaId/subscribe
 * Resubscribe to a specific idea (authenticated)
 */
protectedRouter.post("/idea/:ideaId/subscribe", async (req, res) => {
  try {
    const { ideaId } = req.params;
    const userId = req.user.id;

    const [subscription, created] = await IdeaSubscription.findOrCreate({
      where: { userId, ideaId },
      defaults: { userId, ideaId, subscribed: true },
    });

    if (!created) {
      await subscription.update({ subscribed: true });
    }

    res.json({
      success: true,
      message: "Subscribed to idea notifications",
      ideaId,
    });
  } catch (error) {
    logger.error("[Unsubscribe] Idea subscribe error:", error);
    res.status(500).json({ error: "Failed to subscribe to idea" });
  }
});

/**
 * POST /api/unsubscribe/type/:type
 * Unsubscribe from a specific email type (authenticated)
 */
protectedRouter.post("/type/:type", async (req, res) => {
  try {
    const { type } = req.params;
    const userId = req.user.id;

    // Map type to preference field
    const typeToField = {
      comments: "commentsOnIdeas",
      replies: "repliesToComments",
      status: "statusChanges",
      implemented: "ideaImplemented",
      newIdeas: "newIdeas",
      weekly: "weeklySummary",
      monthly: "monthlyReports",
      engagement: "engagementEmails",
      adminNewIdeas: "adminNewIdeas",
      adminAttention: "adminNeedsAttention",
      adminSummary: "adminMonthlySummary",
    };

    const field = typeToField[type];
    if (!field) {
      return res.status(400).json({ error: "Invalid notification type" });
    }

    const [preferences] = await NotificationPreferences.findOrCreate({
      where: { userId },
      defaults: { userId },
    });

    await preferences.update({ [field]: false });

    res.json({
      success: true,
      message: `Unsubscribed from ${getTypeDisplayName(type)}`,
      type,
    });
  } catch (error) {
    logger.error("[Unsubscribe] Type unsubscribe error:", error);
    res.status(500).json({ error: "Failed to unsubscribe from type" });
  }
});

/**
 * GET /api/unsubscribe/idea/:ideaId/status
 * Get subscription status for an idea (authenticated)
 */
protectedRouter.get("/idea/:ideaId/status", async (req, res) => {
  try {
    const { ideaId } = req.params;
    const userId = req.user.id;

    const subscription = await IdeaSubscription.findOne({
      where: { userId, ideaId },
    });

    res.json({
      ideaId,
      subscribed: subscription ? subscription.subscribed : null, // null = default behavior
    });
  } catch (error) {
    logger.error("[Unsubscribe] Status check error:", error);
    res.status(500).json({ error: "Failed to check subscription status" });
  }
});

/**
 * Helper function to mask email for privacy
 * @param {string} email Email address
 * @returns {string} Masked email (e.g., j***@example.com)
 */
function maskEmail(email) {
  if (!email) return null;

  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return "***@***";

  const maskedLocal = localPart.charAt(0) + "***";
  return `${maskedLocal}@${domain}`;
}
