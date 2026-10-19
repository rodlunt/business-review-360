import express from "express";
import { requireAdmin, requireSameOrganization } from "../middleware/auth.js";
import { calculateComprehensiveROI } from "../utils/roiCalculator.js";
import { formatServerError } from "../utils/formatServerError.js";
import { respondToServiceError } from "../services/errors.js";
import { getDashboardAnalytics, getPriorityMatrix } from "../services/analyticsService.js";
import { generateAnalyticsInsights } from "../services/aiInsightsService.js";
import Organization from "../models/Organization.js";

const aiInsightsCache = new Map(); // key: organizationId, value: { data, expiresAt }
const AI_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

const aiInsightsRateLimit = new Map(); // key: organizationId, value: { count, windowStart }
const AI_RATE_LIMIT_MAX = 5;
const AI_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

const router = express.Router();

router.get("/", requireSameOrganization, requireAdmin, async (req, res) => {
  try {
    const data = await getDashboardAnalytics({ organizationId: req.user.organizationId });
    res.json(data);
  } catch (err) {
    return respondToServiceError(res, err, {
      fallbackMessage: "Failed to fetch analytics data",
      logContext: "Analytics error:",
    });
  }
});

router.get("/priority-matrix", requireSameOrganization, requireAdmin, async (req, res) => {
  try {
    const data = await getPriorityMatrix({ organizationId: req.user.organizationId });
    res.json(data);
  } catch (err) {
    return respondToServiceError(res, err, {
      fallbackMessage: "Failed to fetch priority matrix data",
      logContext: "Priority matrix error:",
    });
  }
});

router.post("/calculate-roi", async (req, res) => {
  try {
    const {
      timeSavedMinutes,
      frequencyCount,
      frequencyPeriod,
      implementationCost,
      hourlyRate,
      overheadMultiplier,
      years,
      discountRate,
    } = req.body;

    if (!timeSavedMinutes || !frequencyCount || !frequencyPeriod) {
      return res.status(400).json({
        error: "Time saved, frequency count, and frequency period are required",
      });
    }
    if (!implementationCost && implementationCost !== 0) {
      return res.status(400).json({ error: "Implementation cost is required" });
    }

    const roiMetrics = calculateComprehensiveROI({
      timeSavedMinutes: parseFloat(timeSavedMinutes),
      frequencyCount: parseInt(frequencyCount),
      frequencyPeriod,
      implementationCost: parseFloat(implementationCost),
      hourlyRate: hourlyRate ? parseFloat(hourlyRate) : undefined,
      overheadMultiplier: overheadMultiplier ? parseFloat(overheadMultiplier) : undefined,
      years: years ? parseInt(years) : undefined,
      discountRate: discountRate ? parseFloat(discountRate) : undefined,
    });

    res.json({
      success: true,
      ...roiMetrics,
      inputs: {
        timeSavedMinutes: parseFloat(timeSavedMinutes),
        frequencyCount: parseInt(frequencyCount),
        frequencyPeriod,
        implementationCost: parseFloat(implementationCost),
        hourlyRate: hourlyRate || 50,
        overheadMultiplier: overheadMultiplier || 1.3,
        years: years || 3,
        discountRate: discountRate || 0.1,
      },
    });
  } catch (err) {
    res
      .status(500)
      .json(formatServerError(err, "Failed to calculate ROI", "ROI calculation error:"));
  }
});

// GET /api/analytics/ai-insights
// Returns AI-generated commentary on dashboard KPIs.
// Returns { enabled: false } if AI is not configured for this org.
router.get("/ai-insights", requireSameOrganization, requireAdmin, async (req, res) => {
  try {
    if (process.env.BR360_AI_KILL_SWITCH === "true") {
      return res.json({ enabled: false });
    }
    const org = await Organization.findOne({
      where: { organizationId: req.user.organizationId },
      attributes: ["organizationName", "aiMode"],
    });
    if (!org || !org.aiMode || org.aiMode === "disabled") {
      return res.json({ enabled: false });
    }
    const cached = aiInsightsCache.get(req.user.organizationId);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json({ enabled: true, ...cached.data, fromCache: true });
    }
    const now = Date.now();
    const rl = aiInsightsRateLimit.get(req.user.organizationId) ?? { count: 0, windowStart: now };
    if (now - rl.windowStart > AI_RATE_WINDOW_MS) {
      rl.count = 0;
      rl.windowStart = now;
    }
    if (rl.count >= AI_RATE_LIMIT_MAX) {
      return res
        .status(429)
        .json({ error: "AI insights rate limit exceeded. Try again in an hour." });
    }
    rl.count++;
    aiInsightsRateLimit.set(req.user.organizationId, rl);
    const data = await generateAnalyticsInsights({
      organizationId: req.user.organizationId,
      organizationName: org.organizationName,
    });
    aiInsightsCache.set(req.user.organizationId, { data, expiresAt: Date.now() + AI_CACHE_TTL_MS });
    res.json({ enabled: true, ...data });
  } catch (err) {
    return respondToServiceError(res, err, {
      fallbackMessage: "Failed to generate AI insights",
      logContext: "AI insights error:",
    });
  }
});

export default router;
