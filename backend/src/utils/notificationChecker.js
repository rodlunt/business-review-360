/**
 * Notification Preference Checker Utility
 *
 * Provides functions to check if a user should receive specific notification types
 * based on their preferences and subscription status.
 *
 * Issue #443: User notification preferences system
 */

import NotificationPreferences from "../models/NotificationPreferences.js";
import IdeaSubscription from "../models/IdeaSubscription.js";
import { logger } from "./logger.js";

/**
 * Notification types that can be checked
 */
export const NotificationType = {
  // User notifications
  COMMENTS_ON_IDEAS: "commentsOnIdeas",
  REPLIES_TO_COMMENTS: "repliesToComments",
  STATUS_CHANGES: "statusChanges",
  IDEA_IMPLEMENTED: "ideaImplemented",
  NEW_IDEAS: "newIdeas",
  WEEKLY_SUMMARY: "weeklySummary",
  MONTHLY_REPORTS: "monthlyReports",
  ENGAGEMENT_EMAILS: "engagementEmails",

  // Admin notifications
  ADMIN_NEW_IDEAS: "adminNewIdeas",
  ADMIN_NEEDS_ATTENTION: "adminNeedsAttention",
  ADMIN_MONTHLY_SUMMARY: "adminMonthlySummary",
};

/**
 * Get or create notification preferences for a user
 * @param {string} userId - The user's UUID
 * @returns {Promise<NotificationPreferences>} The user's notification preferences
 */
export async function getPreferences(userId) {
  const [preferences] = await NotificationPreferences.findOrCreate({
    where: { userId },
    defaults: { userId },
  });
  return preferences;
}

/**
 * Check if a user should receive a specific type of notification
 * @param {string} userId - The user's UUID
 * @param {string} notificationType - The type of notification (from NotificationType)
 * @returns {Promise<boolean>} True if user should receive the notification
 */
export async function shouldSendNotification(userId, notificationType) {
  try {
    const preferences = await getPreferences(userId);

    // Check global unsubscribe first
    if (preferences.globalUnsubscribe) {
      return false;
    }

    // Check if email frequency is off (except for critical types)
    if (preferences.emailFrequency === "off") {
      // Still allow admin notifications as they have separate frequency settings
      const adminTypes = [
        NotificationType.ADMIN_NEW_IDEAS,
        NotificationType.ADMIN_NEEDS_ATTENTION,
        NotificationType.ADMIN_MONTHLY_SUMMARY,
      ];
      if (!adminTypes.includes(notificationType)) {
        return false;
      }
    }

    // Check the specific notification type preference
    const preferenceValue = preferences[notificationType];
    if (preferenceValue === undefined) {
      // Unknown notification type, default to sending
      logger.warn(`[NotificationChecker] Unknown notification type: ${notificationType}`);
      return true;
    }

    return preferenceValue === true;
  } catch (error) {
    logger.error(
      `[NotificationChecker] Error checking notification preference for user ${userId}:`,
      error
    );
    // Default to sending on error to avoid missing important notifications
    return true;
  }
}

/**
 * Check if a user is subscribed to a specific idea
 * @param {string} userId - The user's UUID
 * @param {string} ideaId - The idea's UUID
 * @returns {Promise<boolean>} True if user is subscribed to the idea
 */
export async function isSubscribedToIdea(userId, ideaId) {
  try {
    const subscription = await IdeaSubscription.findOne({
      where: { userId, ideaId },
    });

    // If no subscription record exists, default behavior depends on context
    // For idea authors, they're automatically subscribed
    // For others, they need to explicitly subscribe
    if (!subscription) {
      return null; // Indicates no explicit preference
    }

    return subscription.subscribed;
  } catch (error) {
    logger.error(
      `[NotificationChecker] Error checking idea subscription for user ${userId}:`,
      error
    );
    return null;
  }
}

/**
 * Check if a user should receive notifications for a specific idea activity
 * This combines preference checking with subscription status
 *
 * @param {string} userId - The user's UUID
 * @param {string} ideaId - The idea's UUID
 * @param {string} notificationType - The type of notification
 * @param {object} options - Additional options
 * @param {boolean} options.isIdeaAuthor - Whether user is the idea author
 * @param {boolean} options.isCommentAuthor - Whether user authored a comment being replied to
 * @returns {Promise<boolean>} True if user should receive the notification
 */
export async function shouldSendIdeaNotification(userId, ideaId, notificationType, options = {}) {
  try {
    // First check if the notification type is enabled
    const typeEnabled = await shouldSendNotification(userId, notificationType);
    if (!typeEnabled) {
      return false;
    }

    // Check idea-specific subscription
    const subscription = await isSubscribedToIdea(userId, ideaId);

    // If explicitly unsubscribed, don't send
    if (subscription === false) {
      return false;
    }

    // If explicitly subscribed, send
    if (subscription === true) {
      return true;
    }

    // No explicit subscription - use defaults based on user role
    // Idea authors and comment authors are implicitly subscribed
    if (options.isIdeaAuthor || options.isCommentAuthor) {
      return true;
    }

    // For others with no subscription, don't send unsolicited notifications
    return false;
  } catch (error) {
    logger.error(`[NotificationChecker] Error in shouldSendIdeaNotification:`, error);
    // Default to not sending on error for non-critical notifications
    return false;
  }
}

/**
 * Get the email frequency setting for a user
 * @param {string} userId - The user's UUID
 * @returns {Promise<string>} The email frequency ('realtime', 'hourly', 'daily', 'weekly', 'off')
 */
export async function getEmailFrequency(userId) {
  try {
    const preferences = await getPreferences(userId);
    return preferences.emailFrequency;
  } catch (error) {
    logger.error(`[NotificationChecker] Error getting email frequency for user ${userId}:`, error);
    return "realtime"; // Default to realtime on error
  }
}

/**
 * Get the admin new ideas notification frequency
 * @param {string} userId - The user's UUID
 * @returns {Promise<string>} The frequency ('realtime', 'hourly', 'daily', 'weekly')
 */
export async function getAdminNewIdeasFrequency(userId) {
  try {
    const preferences = await getPreferences(userId);
    return preferences.adminNewIdeasFrequency;
  } catch (error) {
    logger.error(
      `[NotificationChecker] Error getting admin new ideas frequency for user ${userId}:`,
      error
    );
    return "realtime"; // Default to realtime on error
  }
}

/**
 * Filter a list of user IDs to only those who want to receive a notification type
 * Useful for bulk operations like sending to all admins
 *
 * @param {string[]} userIds - Array of user UUIDs
 * @param {string} notificationType - The type of notification
 * @returns {Promise<string[]>} Filtered array of user IDs who should receive the notification
 */
export async function filterUsersWhoWantNotification(userIds, notificationType) {
  const results = await Promise.all(
    userIds.map(async (userId) => ({
      userId,
      shouldSend: await shouldSendNotification(userId, notificationType),
    }))
  );

  return results.filter((r) => r.shouldSend).map((r) => r.userId);
}

/**
 * Auto-subscribe a user to an idea
 * Called when user creates an idea or comments on one
 *
 * @param {string} userId - The user's UUID
 * @param {string} ideaId - The idea's UUID
 * @returns {Promise<void>}
 */
export async function autoSubscribeToIdea(userId, ideaId) {
  try {
    await IdeaSubscription.findOrCreate({
      where: { userId, ideaId },
      defaults: { userId, ideaId, subscribed: true },
    });
  } catch (error) {
    logger.error(
      `[NotificationChecker] Error auto-subscribing user ${userId} to idea ${ideaId}:`,
      error
    );
  }
}

export default {
  NotificationType,
  getPreferences,
  shouldSendNotification,
  isSubscribedToIdea,
  shouldSendIdeaNotification,
  getEmailFrequency,
  getAdminNewIdeasFrequency,
  filterUsersWhoWantNotification,
  autoSubscribeToIdea,
};
