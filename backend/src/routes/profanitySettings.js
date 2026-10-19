import express from "express";
import { requireAdmin, requireSuperuser } from "../middleware/auth.js";
import Setting from "../models/Setting.js";
import { invalidateSettingsCache } from "../middleware/profanityFilter.js";
import { auditLogger, logAuditEvent, redactForAudit } from "../middleware/auditLog.js";
import { logger } from "../utils/logger.js";

const router = express.Router();

// Must stay in sync with DEMO_ORG_ID in jobs/demoResetJob.js. The shared
// demo org is a public sandbox where every member is a superuser, so its
// users must not be able to change the (global) profanity configuration.
const DEMO_ORG_ID = "demo-corp";

// Get profanity filter settings (admin only)
router.get(
  "/",
  auditLogger({ action: "profanity-settings.view", resourceType: "settings" }),
  requireAdmin,
  async (req, res) => {
    try {
      const enabledSetting = await Setting.findOne({ where: { key: "profanityFilterEnabled" } });
      const customWordsSetting = await Setting.findOne({ where: { key: "profanityCustomWords" } });

      res.json({
        enabled: enabledSetting ? enabledSetting.value === "true" : true,
        customWords: customWordsSetting ? JSON.parse(customWordsSetting.value || "[]") : [],
      });
    } catch (error) {
      logger.error("Error fetching profanity settings:", error);
      res.status(500).json({ error: "Failed to fetch profanity filter settings" });
    }
  }
);

// Update profanity filter settings (superuser only; locked on the demo org)
router.post("/", requireSuperuser, async (req, res) => {
  if (req.user?.organizationId === DEMO_ORG_ID) {
    return res
      .status(403)
      .json({ error: "Profanity settings are locked on the demo organisation." });
  }

  const { enabled, customWords } = req.body;

  // Validate input
  if (typeof enabled !== "boolean") {
    return res.status(400).json({ error: "enabled must be a boolean" });
  }

  if (customWords && !Array.isArray(customWords)) {
    return res.status(400).json({ error: "customWords must be an array" });
  }

  // Validate custom words (must be strings, no empty strings)
  if (customWords) {
    const invalidWords = customWords.filter(
      (word) => typeof word !== "string" || word.trim().length === 0
    );

    if (invalidWords.length > 0) {
      return res.status(400).json({
        error: "All custom words must be non-empty strings",
      });
    }
  }

  const SETTING_KEYS = ["profanityFilterEnabled", "profanityCustomWords"];
  const beforeRows = await Setting.findAll({ where: { key: SETTING_KEYS } });
  const beforeMap = Object.fromEntries(beforeRows.map((r) => [r.key, r.value]));

  try {
    // Update settings
    await Setting.upsert({
      key: "profanityFilterEnabled",
      value: String(enabled),
    });

    if (customWords) {
      await Setting.upsert({
        key: "profanityCustomWords",
        value: JSON.stringify(customWords.map((w) => w.trim().toLowerCase())),
      });
    }

    // Invalidate cache so changes take effect immediately
    invalidateSettingsCache();

    const afterRows = await Setting.findAll({ where: { key: SETTING_KEYS } });
    const afterMap = Object.fromEntries(afterRows.map((r) => [r.key, r.value]));
    await logAuditEvent(req, {
      action: "profanity-settings.update",
      resourceType: "settings",
      changes: { before: redactForAudit(beforeMap), after: redactForAudit(afterMap) },
      status: "success",
    });
    return res.json({
      success: true,
      message: "Profanity filter settings updated successfully",
    });
  } catch (error) {
    await logAuditEvent(req, {
      action: "profanity-settings.update",
      resourceType: "settings",
      changes: { before: redactForAudit(beforeMap), after: null },
      status: "failure",
      metadata: { error: error.message },
    });
    throw error;
  }
});

// Test endpoint to check if text contains profanity (admin only)
router.post(
  "/test",
  auditLogger({ action: "profanity-settings.test", resourceType: "settings", captureBody: true }),
  requireAdmin,
  async (req, res) => {
    try {
      const { text } = req.body;

      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "text is required and must be a string" });
      }

      const { checkProfanity } = await import("../middleware/profanityFilter.js");
      const result = await checkProfanity(text);

      res.json({
        text,
        isProfane: result.isProfane,
        cleanText: result.cleanText,
      });
    } catch (error) {
      logger.error("Error testing profanity:", error);
      res.status(500).json({ error: "Failed to test text for profanity" });
    }
  }
);

export default router;
