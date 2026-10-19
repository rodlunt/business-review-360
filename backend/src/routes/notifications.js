import express from "express";
import { requireSameOrganization } from "../middleware/auth.js";
import NotificationPreferences from "../models/NotificationPreferences.js";
import IdeaSubscription from "../models/IdeaSubscription.js";
import Idea from "../models/Idea.js";
import { isValidUUID } from "../utils/validation.js";
import { formatServerError } from "../utils/formatServerError.js";

const router = express.Router();

// ============================================
// NOTIFICATION PREFERENCES
// ============================================

/**
 * GET /api/notifications/preferences
 * Get current user's notification preferences
 */
router.get("/preferences", async (req, res) => {
  try {
    // Find or create preferences for this user
    let [preferences] = await NotificationPreferences.findOrCreate({
      where: { userId: req.user.id },
      defaults: { userId: req.user.id },
    });

    // Return preferences with user's admin status for frontend to show/hide admin options
    res.json({
      ...preferences.toJSON(),
      isAdmin: req.user.isAdmin,
    });
  } catch (err) {
    res
      .status(500)
      .json(
        formatServerError(
          err,
          "Failed to fetch notification preferences",
          "Error fetching notification preferences:"
        )
      );
  }
});

/**
 * PUT /api/notifications/preferences
 * Update current user's notification preferences
 */
router.put("/preferences", async (req, res) => {
  try {
    const {
      emailFrequency,
      commentsOnIdeas,
      repliesToComments,
      statusChanges,
      ideaImplemented,
      newIdeas,
      weeklySummary,
      monthlyReports,
      engagementEmails,
      adminNewIdeas,
      adminNewIdeasFrequency,
      adminNeedsAttention,
      adminMonthlySummary,
      globalUnsubscribe,
    } = req.body;

    // Find or create preferences
    let [preferences] = await NotificationPreferences.findOrCreate({
      where: { userId: req.user.id },
      defaults: { userId: req.user.id },
    });

    // Update allowed fields
    const updateFields = {};

    // Common user preferences
    if (emailFrequency !== undefined) updateFields.emailFrequency = emailFrequency;
    if (commentsOnIdeas !== undefined) updateFields.commentsOnIdeas = commentsOnIdeas;
    if (repliesToComments !== undefined) updateFields.repliesToComments = repliesToComments;
    if (statusChanges !== undefined) updateFields.statusChanges = statusChanges;
    if (ideaImplemented !== undefined) updateFields.ideaImplemented = ideaImplemented;
    if (newIdeas !== undefined) updateFields.newIdeas = newIdeas;
    if (weeklySummary !== undefined) updateFields.weeklySummary = weeklySummary;
    if (monthlyReports !== undefined) updateFields.monthlyReports = monthlyReports;
    if (engagementEmails !== undefined) updateFields.engagementEmails = engagementEmails;
    if (globalUnsubscribe !== undefined) updateFields.globalUnsubscribe = globalUnsubscribe;

    // Admin-only preferences (only if user is admin)
    if (req.user.isAdmin) {
      if (adminNewIdeas !== undefined) updateFields.adminNewIdeas = adminNewIdeas;
      if (adminNewIdeasFrequency !== undefined)
        updateFields.adminNewIdeasFrequency = adminNewIdeasFrequency;
      if (adminNeedsAttention !== undefined) updateFields.adminNeedsAttention = adminNeedsAttention;
      if (adminMonthlySummary !== undefined) updateFields.adminMonthlySummary = adminMonthlySummary;
    }

    await preferences.update(updateFields);

    res.json({
      ...preferences.toJSON(),
      isAdmin: req.user.isAdmin,
    });
  } catch (err) {
    res
      .status(500)
      .json(
        formatServerError(
          err,
          "Failed to update notification preferences",
          "Error updating notification preferences:"
        )
      );
  }
});

/**
 * POST /api/notifications/preferences/reset
 * Reset preferences to defaults
 */
router.post("/preferences/reset", async (req, res) => {
  try {
    // Delete existing preferences (will recreate with defaults)
    await NotificationPreferences.destroy({
      where: { userId: req.user.id },
    });

    // Create new preferences with defaults
    const preferences = await NotificationPreferences.create({
      userId: req.user.id,
    });

    res.json({
      ...preferences.toJSON(),
      isAdmin: req.user.isAdmin,
      message: "Preferences reset to defaults",
    });
  } catch (err) {
    res
      .status(500)
      .json(
        formatServerError(
          err,
          "Failed to reset notification preferences",
          "Error resetting notification preferences:"
        )
      );
  }
});

// ============================================
// IDEA SUBSCRIPTIONS
// ============================================

/**
 * GET /api/notifications/subscriptions
 * Get all idea subscriptions for current user
 */
router.get("/subscriptions", async (req, res) => {
  try {
    const subscriptions = await IdeaSubscription.findAll({
      where: {
        userId: req.user.id,
        subscribed: true,
      },
      include: [
        {
          model: Idea,
          as: "idea",
          attributes: ["id", "title", "slug", "status"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    res.json(subscriptions);
  } catch (err) {
    res
      .status(500)
      .json(
        formatServerError(err, "Failed to fetch subscriptions", "Error fetching subscriptions:")
      );
  }
});

/**
 * GET /api/notifications/ideas/:ideaId/subscription
 * Check if user is subscribed to a specific idea
 */
router.get("/ideas/:ideaId/subscription", requireSameOrganization, async (req, res) => {
  try {
    if (!isValidUUID(req.params.ideaId)) {
      return res.status(404).json({ error: "Idea not found" });
    }

    const subscription = await IdeaSubscription.findOne({
      where: {
        userId: req.user.id,
        ideaId: req.params.ideaId,
      },
    });

    res.json({
      ideaId: req.params.ideaId,
      subscribed: subscription?.subscribed ?? false,
    });
  } catch (err) {
    res
      .status(500)
      .json(formatServerError(err, "Failed to check subscription", "Error checking subscription:"));
  }
});

/**
 * POST /api/notifications/ideas/:ideaId/subscribe
 * Subscribe to notifications for a specific idea
 */
router.post("/ideas/:ideaId/subscribe", requireSameOrganization, async (req, res) => {
  try {
    if (!isValidUUID(req.params.ideaId)) {
      return res.status(404).json({ error: "Idea not found" });
    }

    // Verify idea exists
    const idea = await Idea.findByPk(req.params.ideaId);
    if (!idea) {
      return res.status(404).json({ error: "Idea not found" });
    }

    // Upsert subscription
    const [subscription, created] = await IdeaSubscription.findOrCreate({
      where: {
        userId: req.user.id,
        ideaId: req.params.ideaId,
      },
      defaults: {
        userId: req.user.id,
        ideaId: req.params.ideaId,
        subscribed: true,
      },
    });

    if (!created && !subscription.subscribed) {
      await subscription.update({ subscribed: true });
    }

    res.json({
      ideaId: req.params.ideaId,
      subscribed: true,
      message: "Subscribed to idea notifications",
    });
  } catch (err) {
    res
      .status(500)
      .json(formatServerError(err, "Failed to subscribe to idea", "Error subscribing to idea:"));
  }
});

/**
 * POST /api/notifications/ideas/:ideaId/unsubscribe
 * Unsubscribe from notifications for a specific idea
 */
router.post("/ideas/:ideaId/unsubscribe", requireSameOrganization, async (req, res) => {
  try {
    if (!isValidUUID(req.params.ideaId)) {
      return res.status(404).json({ error: "Idea not found" });
    }

    // Upsert with subscribed = false
    const [subscription, created] = await IdeaSubscription.findOrCreate({
      where: {
        userId: req.user.id,
        ideaId: req.params.ideaId,
      },
      defaults: {
        userId: req.user.id,
        ideaId: req.params.ideaId,
        subscribed: false,
      },
    });

    if (!created && subscription.subscribed) {
      await subscription.update({ subscribed: false });
    }

    res.json({
      ideaId: req.params.ideaId,
      subscribed: false,
      message: "Unsubscribed from idea notifications",
    });
  } catch (err) {
    res
      .status(500)
      .json(
        formatServerError(err, "Failed to unsubscribe from idea", "Error unsubscribing from idea:")
      );
  }
});

export default router;
