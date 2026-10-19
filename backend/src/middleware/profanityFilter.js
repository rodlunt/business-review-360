import Setting from "../models/Setting.js";
import { logger, createLogger } from "../utils/logger.js";

// Dynamic import for bad-words (ES module)
let Filter = null;
const loadFilter = async () => {
  if (!Filter) {
    const module = await import("bad-words");
    // bad-words v4+ exports Filter as a named export, not default
    Filter = module.Filter || module.default;
  }
  return Filter;
};

// Cache for settings to avoid database lookups on every request
let settingsCache = {
  enabled: true,
  customWords: [],
  lastUpdated: null,
};

// Refresh cache every 5 minutes
const CACHE_TTL = 5 * 60 * 1000;

/**
 * Refresh profanity filter settings from database
 */
async function refreshSettings() {
  try {
    const now = Date.now();
    if (settingsCache.lastUpdated && now - settingsCache.lastUpdated < CACHE_TTL) {
      return settingsCache;
    }

    const enabledSetting = await Setting.findOne({ where: { key: "profanityFilterEnabled" } });
    const customWordsSetting = await Setting.findOne({ where: { key: "profanityCustomWords" } });

    settingsCache = {
      enabled: enabledSetting ? enabledSetting.value === "true" : true,
      customWords: customWordsSetting ? JSON.parse(customWordsSetting.value || "[]") : [],
      lastUpdated: now,
    };

    return settingsCache;
  } catch (error) {
    logger.error("Error refreshing profanity filter settings:", error);
    // Return default settings on error
    return { enabled: true, customWords: [], lastUpdated: Date.now() };
  }
}

/**
 * Force cache refresh (call this when settings are updated)
 */
export function invalidateSettingsCache() {
  settingsCache.lastUpdated = null;
}

/**
 * Check if text contains profanity
 * @param {string} text - Text to check
 * @returns {Promise<{isProfane: boolean, cleanText: string}>}
 */
export async function checkProfanity(text) {
  if (!text || typeof text !== "string") {
    return { isProfane: false, cleanText: text };
  }

  const settings = await refreshSettings();

  // If profanity filter is disabled, allow all text
  if (!settings.enabled) {
    return { isProfane: false, cleanText: text };
  }

  const FilterClass = await loadFilter();
  const filter = new FilterClass();

  // Add custom words to the filter
  if (settings.customWords && settings.customWords.length > 0) {
    filter.addWords(...settings.customWords);
  }

  const isProfane = filter.isProfane(text);
  const cleanText = filter.clean(text);

  return { isProfane, cleanText };
}

/**
 * Middleware to validate text fields for profanity
 * Usage: validateProfanity(['title', 'description', 'content'])
 *
 * @param {string[]} fields - Array of field names to validate
 * @returns {Function} Express middleware function
 */
export function validateProfanity(fields = []) {
  return async (req, res, next) => {
    try {
      const settings = await refreshSettings();

      // If profanity filter is disabled, skip validation
      if (!settings.enabled) {
        return next();
      }

      const errors = [];

      for (const field of fields) {
        const text = req.body[field];

        if (text && typeof text === "string") {
          const { isProfane } = await checkProfanity(text);

          if (isProfane) {
            errors.push({
              field,
              message: "Please keep language professional and appropriate for the workplace.",
            });
          }
        }
      }

      if (errors.length > 0) {
        return res.status(400).json({
          error: "Profanity detected",
          details: errors,
        });
      }

      next();
    } catch (error) {
      const log = createLogger(req);
      log.error("Profanity validation error:", error);
      // On error, allow the request to proceed (fail open)
      next();
    }
  };
}

/**
 * Validate a single text value for profanity
 * @param {string} text - Text to validate
 * @returns {Promise<{isValid: boolean, error: string|null}>}
 */
export async function validateText(text) {
  if (!text || typeof text !== "string") {
    return { isValid: true, error: null };
  }

  const { isProfane } = await checkProfanity(text);

  if (isProfane) {
    return {
      isValid: false,
      error: "Please keep language professional and appropriate for the workplace.",
    };
  }

  return { isValid: true, error: null };
}

export default {
  checkProfanity,
  validateProfanity,
  validateText,
  invalidateSettingsCache,
};
