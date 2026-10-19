/**
 * Survey Routes
 *
 * API endpoints for survey submission and management.
 *
 * Issue #445: Engagement and re-engagement email templates
 */

import express from "express";
import { requireAdmin } from "../middleware/auth.js";
import Survey from "../models/Survey.js";
import SurveyToken from "../models/SurveyToken.js";
import User from "../models/User.js";
import { sendSurveyThankYou } from "../services/engagementEmailService.js";
import { Op, fn, col } from "sequelize";
import { logger } from "../utils/logger.js";

// #720: split into public + protected sub-routers so this file no longer
// imports `authenticate` directly. authenticate is mounted in index.js
// on the protected router.
export const publicRouter = express.Router();
export const protectedRouter = express.Router();

/**
 * GET /api/surveys/quick-rate
 * One-click rating from email (no auth required, uses token)
 */
publicRouter.get("/quick-rate", async (req, res) => {
  try {
    const { token, rating } = req.query;

    if (!token) {
      return res.status(400).json({ error: "Token is required" });
    }

    const ratingNum = parseInt(rating, 10);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ error: "Rating must be between 1 and 5" });
    }

    // Find the survey token
    const surveyToken = await SurveyToken.findOne({ where: { token } });

    if (!surveyToken) {
      return res.status(404).json({ error: "Invalid token" });
    }

    if (surveyToken.isExpired()) {
      return res.status(410).json({ error: "Token has expired" });
    }

    if (surveyToken.isUsed()) {
      // Redirect to thank you page if already used
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
      return res.redirect(`${frontendUrl}/feedback/thanks?already=true`);
    }

    // Create the survey response
    await Survey.create({
      userId: surveyToken.userId,
      organizationId: surveyToken.organizationId,
      type: surveyToken.type,
      rating: ratingNum,
      isAnonymous: false,
      source: "email",
    });

    // Mark token as used
    await surveyToken.update({
      usedAt: new Date(),
      rating: ratingNum,
    });

    // Send thank you email (async, don't wait)
    sendSurveyThankYou(surveyToken.userId, ratingNum).catch((err) => {
      logger.error("[Surveys] Error sending thank you email:", err);
    });

    // Redirect to thank you page
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    res.redirect(`${frontendUrl}/feedback/thanks?rating=${ratingNum}`);
  } catch (error) {
    logger.error("[Surveys] Quick rate error:", error);
    res.status(500).json({ error: "Failed to submit rating" });
  }
});

/**
 * POST /api/surveys/submit
 * Submit a full survey response
 */
publicRouter.post("/submit", async (req, res) => {
  try {
    const { token, rating, feedback, isAnonymous = false } = req.body;

    if (!token) {
      return res.status(400).json({ error: "Token is required" });
    }

    // Find the survey token
    const surveyToken = await SurveyToken.findOne({ where: { token } });

    if (!surveyToken) {
      return res.status(404).json({ error: "Invalid token" });
    }

    if (surveyToken.isExpired()) {
      return res.status(410).json({ error: "Token has expired" });
    }

    // Create the survey response
    const survey = await Survey.create({
      userId: isAnonymous ? null : surveyToken.userId,
      organizationId: surveyToken.organizationId,
      type: surveyToken.type,
      rating: rating ? parseInt(rating, 10) : null,
      feedback,
      isAnonymous,
      source: "web",
    });

    // Mark token as used if not already
    if (!surveyToken.isUsed()) {
      await surveyToken.update({
        usedAt: new Date(),
        rating: rating ? parseInt(rating, 10) : null,
      });

      // Send thank you email only if not anonymous
      if (!isAnonymous) {
        sendSurveyThankYou(surveyToken.userId, rating).catch((err) => {
          logger.error("[Surveys] Error sending thank you email:", err);
        });
      }
    }

    res.json({
      success: true,
      surveyId: survey.id,
    });
  } catch (error) {
    logger.error("[Surveys] Submit error:", error);
    res.status(500).json({ error: "Failed to submit survey" });
  }
});

/**
 * GET /api/surveys (authenticated)
 * Get user's own survey responses
 */
protectedRouter.get("/", async (req, res) => {
  try {
    const surveys = await Survey.findAll({
      where: { userId: req.user.id },
      order: [["createdAt", "DESC"]],
      limit: 10,
    });

    res.json({ surveys });
  } catch (error) {
    logger.error("[Surveys] Get surveys error:", error);
    res.status(500).json({ error: "Failed to get surveys" });
  }
});

/**
 * GET /api/surveys/admin (admin only)
 * Get all survey responses for the organization
 */
protectedRouter.get("/admin", requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, type } = req.query;
    const offset = (page - 1) * limit;

    const where = { organizationId: req.user.organizationId };
    if (type) {
      where.type = type;
    }

    const { count, rows: surveys } = await Survey.findAndCountAll({
      where,
      include: [
        {
          model: User,
          attributes: ["id", "username", "email"],
          required: false,
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: parseInt(limit, 10),
      offset,
    });

    res.json({
      surveys,
      pagination: {
        total: count,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    logger.error("[Surveys] Admin get surveys error:", error);
    res.status(500).json({ error: "Failed to get surveys" });
  }
});

/**
 * GET /api/surveys/admin/stats (admin only)
 * Get aggregated survey statistics
 */
protectedRouter.get("/admin/stats", requireAdmin, async (req, res) => {
  try {
    const organizationId = req.user.organizationId;
    const { type = "satisfaction", period = "90" } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period, 10));

    // Get rating distribution
    const ratingDistribution = await Survey.findAll({
      where: {
        organizationId,
        type,
        rating: { [Op.not]: null },
        createdAt: { [Op.gte]: startDate },
      },
      attributes: ["rating", [fn("COUNT", col("id")), "count"]],
      group: ["rating"],
      raw: true,
    });

    // Calculate averages
    const allRatings = await Survey.findAll({
      where: {
        organizationId,
        type,
        rating: { [Op.not]: null },
        createdAt: { [Op.gte]: startDate },
      },
      attributes: ["rating"],
      raw: true,
    });

    const totalResponses = allRatings.length;
    const averageRating =
      totalResponses > 0 ? allRatings.reduce((sum, r) => sum + r.rating, 0) / totalResponses : 0;

    // Get responses with feedback
    const feedbackCount = await Survey.count({
      where: {
        organizationId,
        type,
        feedback: { [Op.not]: null },
        createdAt: { [Op.gte]: startDate },
      },
    });

    // NPS calculation (if applicable)
    // Promoters (4-5), Passives (3), Detractors (1-2)
    const promoters = allRatings.filter((r) => r.rating >= 4).length;
    const detractors = allRatings.filter((r) => r.rating <= 2).length;
    const nps =
      totalResponses > 0 ? Math.round(((promoters - detractors) / totalResponses) * 100) : 0;

    // Recent feedback samples
    const recentFeedback = await Survey.findAll({
      where: {
        organizationId,
        type,
        feedback: { [Op.not]: null },
        createdAt: { [Op.gte]: startDate },
      },
      attributes: ["id", "rating", "feedback", "createdAt", "isAnonymous"],
      include: [
        {
          model: User,
          attributes: ["username"],
          required: false,
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: 10,
    });

    res.json({
      type,
      period: `${period} days`,
      totalResponses,
      averageRating: Math.round(averageRating * 100) / 100,
      nps,
      feedbackCount,
      ratingDistribution: ratingDistribution.reduce(
        (acc, r) => {
          acc[r.rating] = parseInt(r.count, 10);
          return acc;
        },
        { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
      ),
      recentFeedback: recentFeedback.map((f) => ({
        id: f.id,
        rating: f.rating,
        feedback: f.feedback,
        createdAt: f.createdAt,
        author: f.isAnonymous ? "Anonymous" : f.User?.username || "Unknown",
      })),
    });
  } catch (error) {
    logger.error("[Surveys] Admin stats error:", error);
    res.status(500).json({ error: "Failed to get survey stats" });
  }
});
