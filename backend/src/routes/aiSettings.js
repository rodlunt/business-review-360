/**
 * AI settings routes -- issue #721.
 * Admin-only: read/save the organisation's AI mode, provider, and BYO key.
 */

import express from "express";
import { requireAdmin, requireSameOrganization } from "../middleware/auth.js";
import { respondToServiceError, ValidationError } from "../services/errors.js";
import Organization from "../models/Organization.js";
import { encryptApiKey, resolveProvider } from "../adapters/ai/index.js";

const router = express.Router();

const VALID_MODES = ["disabled", "byo", "managed"];
const VALID_PROVIDERS = ["anthropic", "openai"];

// GET /api/ai-settings
router.get("/", requireSameOrganization, requireAdmin, async (req, res) => {
  try {
    const org = await Organization.findOne({
      where: { organizationId: req.user.organizationId },
      attributes: ["aiMode", "aiProvider", "aiApiKeyEncrypted"],
    });
    res.json({
      aiMode: org?.aiMode ?? "disabled",
      aiProvider: org?.aiProvider ?? null,
      hasApiKey: Boolean(org?.aiApiKeyEncrypted),
    });
  } catch (err) {
    return respondToServiceError(res, err, {
      fallbackMessage: "Failed to load AI settings",
      logContext: "AI settings GET:",
    });
  }
});

// PUT /api/ai-settings
// Body: { aiMode, aiProvider, apiKey? }
router.put("/", requireSameOrganization, requireAdmin, async (req, res) => {
  try {
    const { aiMode, aiProvider, apiKey } = req.body;

    if (!VALID_MODES.includes(aiMode)) {
      throw new ValidationError(`aiMode must be one of: ${VALID_MODES.join(", ")}`);
    }
    if (aiMode === "byo") {
      if (!VALID_PROVIDERS.includes(aiProvider)) {
        throw new ValidationError(`aiProvider must be one of: ${VALID_PROVIDERS.join(", ")}`);
      }
    }

    const org = await Organization.findOne({ where: { organizationId: req.user.organizationId } });

    const update = { aiMode, aiProvider: aiMode === "byo" ? aiProvider : null };

    if (aiMode === "byo" && apiKey) {
      update.aiApiKeyEncrypted = encryptApiKey(apiKey);
    } else if (aiMode !== "byo") {
      update.aiApiKeyEncrypted = null;
    }
    // If aiMode is 'byo' and no new apiKey sent, leave existing key as-is.

    await org.update(update);
    res.json({ success: true });
  } catch (err) {
    return respondToServiceError(res, err, {
      fallbackMessage: "Failed to save AI settings",
      logContext: "AI settings PUT:",
    });
  }
});

// POST /api/ai-settings/validate
// Validate the configured key (or a provided key) without saving.
router.post("/validate", requireSameOrganization, requireAdmin, async (req, res) => {
  try {
    const { apiKey, aiProvider } = req.body;
    let result;

    if (apiKey && aiProvider) {
      // Validate an in-flight key before saving
      const { AnthropicProvider } = await import("../adapters/ai/anthropic.js");
      const { OpenAIProvider } = await import("../adapters/ai/openai.js");
      const ProviderClass = aiProvider === "openai" ? OpenAIProvider : AnthropicProvider;
      const provider = new ProviderClass(apiKey);
      result = await provider.validate();
    } else {
      // Validate whatever is currently configured
      const provider = await resolveProvider(req.user.organizationId);
      result = await provider.validate();
    }

    res.json(result);
  } catch (err) {
    res.json({ valid: false, error: err.message });
  }
});

export default router;
