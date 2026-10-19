/**
 * Unsubscribe Service
 *
 * Handles unsubscribe token generation, validation, and processing.
 *
 * Issue #447: Unsubscribe system implementation
 */

import UnsubscribeToken from "../models/UnsubscribeToken.js";
import NotificationPreferences from "../models/NotificationPreferences.js";
import IdeaSubscription from "../models/IdeaSubscription.js";
import User from "../models/User.js";
import Idea from "../models/Idea.js";
import { Op } from "sequelize";
import { logger } from "../utils/logger.js";

/**
 * Types of unsubscribe actions
 */
export const UnsubscribeType = {
  GLOBAL: "global",
  IDEA: "idea",
  COMMENTS: "comments",
  REPLIES: "replies",
  STATUS: "status",
  DIGEST: "digest",
  ENGAGEMENT: "engagement",
  ADMIN_NEW_IDEAS: "adminNewIdeas",
  ADMIN_SUMMARY: "adminSummary",
};

/**
 * Mapping from unsubscribe type to notification preference field
 */
const typeToPreferenceField = {
  [UnsubscribeType.COMMENTS]: "commentsOnIdeas",
  [UnsubscribeType.REPLIES]: "repliesToComments",
  [UnsubscribeType.STATUS]: "statusChanges",
  [UnsubscribeType.DIGEST]: "weeklySummary",
  [UnsubscribeType.ENGAGEMENT]: "engagementEmails",
  [UnsubscribeType.ADMIN_NEW_IDEAS]: "adminNewIdeas",
  [UnsubscribeType.ADMIN_SUMMARY]: "adminMonthlySummary",
};

/**
 * Create an unsubscribe token for a user
 * @param {object} options Token options
 * @returns {Promise<UnsubscribeToken>}
 */
export async function createUnsubscribeToken({
  userId,
  type = UnsubscribeType.GLOBAL,
  ideaId = null,
  ideaTitle = null,
  emailType = null,
  expiresInDays = null, // null = never expires
}) {
  const token = UnsubscribeToken.generateToken();

  // Calculate expiration if specified
  let expiresAt = null;
  if (expiresInDays) {
    expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);
  }

  // Get idea title if ideaId provided but no title
  if (ideaId && !ideaTitle) {
    const idea = await Idea.findByPk(ideaId);
    if (idea) {
      ideaTitle = idea.title;
    }
  }

  return UnsubscribeToken.create({
    userId,
    token,
    type,
    ideaId,
    ideaTitle,
    emailType,
    expiresAt,
  });
}

/**
 * Generate unsubscribe URL for an email
 * @param {string} token The unsubscribe token
 * @returns {string} Full unsubscribe URL
 */
export function getUnsubscribeUrl(token) {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  return `${frontendUrl}/unsubscribe/${token}`;
}

/**
 * Generate all unsubscribe links for an email
 * @param {object} options Email context
 * @returns {Promise<object>} Object with various unsubscribe URLs
 */
export async function generateUnsubscribeLinks({
  userId,
  ideaId = null,
  ideaTitle = null,
  emailType = null,
}) {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";

  // Create global unsubscribe token
  const globalToken = await createUnsubscribeToken({
    userId,
    type: UnsubscribeType.GLOBAL,
  });

  const links = {
    unsubscribeAll: getUnsubscribeUrl(globalToken.token),
    preferences: `${frontendUrl}/settings/notifications`,
  };

  // Create idea-specific token if applicable
  if (ideaId) {
    const ideaToken = await createUnsubscribeToken({
      userId,
      type: UnsubscribeType.IDEA,
      ideaId,
      ideaTitle,
    });
    links.unsubscribeIdea = getUnsubscribeUrl(ideaToken.token);
  }

  // Create email-type-specific token if applicable
  if (emailType && typeToPreferenceField[emailType]) {
    const typeToken = await createUnsubscribeToken({
      userId,
      type: emailType,
      emailType,
    });
    links.unsubscribeType = getUnsubscribeUrl(typeToken.token);
    links.unsubscribeTypeName = getTypeDisplayName(emailType);
  }

  return links;
}

/**
 * Get display name for unsubscribe type
 * @param {string} type Unsubscribe type
 * @returns {string} Human-readable name
 */
export function getTypeDisplayName(type) {
  const names = {
    [UnsubscribeType.GLOBAL]: "all emails",
    [UnsubscribeType.IDEA]: "this idea",
    [UnsubscribeType.COMMENTS]: "comment notifications",
    [UnsubscribeType.REPLIES]: "reply notifications",
    [UnsubscribeType.STATUS]: "status change notifications",
    [UnsubscribeType.DIGEST]: "digest emails",
    [UnsubscribeType.ENGAGEMENT]: "engagement emails",
    [UnsubscribeType.ADMIN_NEW_IDEAS]: "new idea notifications (admin)",
    [UnsubscribeType.ADMIN_SUMMARY]: "admin summary emails",
  };
  return names[type] || type;
}

/**
 * Validate an unsubscribe token
 * @param {string} token The token to validate
 * @returns {Promise<object|null>} Token data or null if invalid
 */
export async function validateToken(token) {
  const unsubToken = await UnsubscribeToken.findOne({
    where: { token },
    include: [
      {
        model: User,
        attributes: ["id", "username", "email", "organizationId"],
      },
    ],
  });

  if (!unsubToken) {
    return { valid: false, error: "Invalid token" };
  }

  if (unsubToken.isExpired()) {
    return { valid: false, error: "Token has expired" };
  }

  if (unsubToken.isUsed()) {
    return {
      valid: false,
      error: "Already unsubscribed",
      alreadyUnsubscribed: true,
      unsubscribedAt: unsubToken.usedAt,
    };
  }

  return {
    valid: true,
    token: unsubToken,
    type: unsubToken.type,
    description: unsubToken.getDescription(),
    ideaId: unsubToken.ideaId,
    ideaTitle: unsubToken.ideaTitle,
    user: unsubToken.User,
  };
}

/**
 * Process an unsubscribe action
 * @param {string} token The unsubscribe token
 * @returns {Promise<object>} Result of unsubscribe action
 */
export async function processUnsubscribe(token) {
  const validation = await validateToken(token);

  if (!validation.valid) {
    return validation;
  }

  const unsubToken = validation.token;
  const userId = unsubToken.userId;

  try {
    switch (unsubToken.type) {
      case UnsubscribeType.GLOBAL:
        await processGlobalUnsubscribe(userId);
        break;

      case UnsubscribeType.IDEA:
        await processIdeaUnsubscribe(userId, unsubToken.ideaId);
        break;

      default:
        // Per-email-type unsubscribe
        await processTypeUnsubscribe(userId, unsubToken.type);
        break;
    }

    // Mark token as used
    await unsubToken.update({ usedAt: new Date() });

    return {
      success: true,
      type: unsubToken.type,
      description: unsubToken.getDescription(),
    };
  } catch (error) {
    logger.error("[Unsubscribe] Error processing unsubscribe:", error);
    return {
      success: false,
      error: "Failed to process unsubscribe",
    };
  }
}

/**
 * Process global unsubscribe (all non-critical emails)
 * @param {string} userId User ID
 */
async function processGlobalUnsubscribe(userId) {
  const [preferences] = await NotificationPreferences.findOrCreate({
    where: { userId },
    defaults: { userId },
  });

  await preferences.update({
    globalUnsubscribe: true,
  });

  logger.info(`[Unsubscribe] User ${userId} globally unsubscribed`);
}

/**
 * Process idea-specific unsubscribe
 * @param {string} userId User ID
 * @param {string} ideaId Idea ID
 */
async function processIdeaUnsubscribe(userId, ideaId) {
  const [subscription, created] = await IdeaSubscription.findOrCreate({
    where: { userId, ideaId },
    defaults: { userId, ideaId, subscribed: false },
  });

  if (!created) {
    await subscription.update({ subscribed: false });
  }

  logger.info(`[Unsubscribe] User ${userId} unsubscribed from idea ${ideaId}`);
}

/**
 * Process per-email-type unsubscribe
 * @param {string} userId User ID
 * @param {string} type Unsubscribe type
 */
async function processTypeUnsubscribe(userId, type) {
  const preferenceField = typeToPreferenceField[type];

  if (!preferenceField) {
    throw new Error(`Unknown unsubscribe type: ${type}`);
  }

  const [preferences] = await NotificationPreferences.findOrCreate({
    where: { userId },
    defaults: { userId },
  });

  await preferences.update({
    [preferenceField]: false,
  });

  logger.info(`[Unsubscribe] User ${userId} unsubscribed from ${type}`);
}

/**
 * Process a resubscribe action
 * @param {string} token The unsubscribe token (used previously)
 * @returns {Promise<object>} Result of resubscribe action
 */
export async function processResubscribe(token) {
  const unsubToken = await UnsubscribeToken.findOne({
    where: { token },
  });

  if (!unsubToken) {
    return { success: false, error: "Invalid token" };
  }

  if (!unsubToken.usedAt) {
    return { success: false, error: "Token was never used for unsubscribe" };
  }

  const userId = unsubToken.userId;

  try {
    switch (unsubToken.type) {
      case UnsubscribeType.GLOBAL:
        await processGlobalResubscribe(userId);
        break;

      case UnsubscribeType.IDEA:
        await processIdeaResubscribe(userId, unsubToken.ideaId);
        break;

      default:
        await processTypeResubscribe(userId, unsubToken.type);
        break;
    }

    // Clear the usedAt timestamp to allow the token to be used again
    await unsubToken.update({ usedAt: null });

    return {
      success: true,
      type: unsubToken.type,
      description: `resubscribed to ${unsubToken.getDescription()}`,
    };
  } catch (error) {
    logger.error("[Unsubscribe] Error processing resubscribe:", error);
    return {
      success: false,
      error: "Failed to process resubscribe",
    };
  }
}

/**
 * Process global resubscribe
 * @param {string} userId User ID
 */
async function processGlobalResubscribe(userId) {
  const preferences = await NotificationPreferences.findOne({
    where: { userId },
  });

  if (preferences) {
    await preferences.update({
      globalUnsubscribe: false,
    });
  }

  logger.info(`[Unsubscribe] User ${userId} globally resubscribed`);
}

/**
 * Process idea-specific resubscribe
 * @param {string} userId User ID
 * @param {string} ideaId Idea ID
 */
async function processIdeaResubscribe(userId, ideaId) {
  const subscription = await IdeaSubscription.findOne({
    where: { userId, ideaId },
  });

  if (subscription) {
    await subscription.update({ subscribed: true });
  } else {
    await IdeaSubscription.create({
      userId,
      ideaId,
      subscribed: true,
    });
  }

  logger.info(`[Unsubscribe] User ${userId} resubscribed to idea ${ideaId}`);
}

/**
 * Process per-email-type resubscribe
 * @param {string} userId User ID
 * @param {string} type Resubscribe type
 */
async function processTypeResubscribe(userId, type) {
  const preferenceField = typeToPreferenceField[type];

  if (!preferenceField) {
    throw new Error(`Unknown resubscribe type: ${type}`);
  }

  const preferences = await NotificationPreferences.findOne({
    where: { userId },
  });

  if (preferences) {
    await preferences.update({
      [preferenceField]: true,
    });
  }

  logger.info(`[Unsubscribe] User ${userId} resubscribed to ${type}`);
}

/**
 * Cleanup expired unsubscribe tokens
 * @param {number} daysOld Delete tokens older than this many days
 * @returns {Promise<number>} Number of tokens deleted
 */
export async function cleanupOldTokens(daysOld = 365) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysOld);

  const deleted = await UnsubscribeToken.destroy({
    where: {
      createdAt: { [Op.lt]: cutoff },
      usedAt: { [Op.not]: null }, // Only delete used tokens
    },
  });

  logger.info(`[Unsubscribe] Cleaned up ${deleted} old tokens`);
  return deleted;
}

export default {
  UnsubscribeType,
  createUnsubscribeToken,
  getUnsubscribeUrl,
  generateUnsubscribeLinks,
  getTypeDisplayName,
  validateToken,
  processUnsubscribe,
  processResubscribe,
  cleanupOldTokens,
};
