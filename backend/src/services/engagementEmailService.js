/**
 * Engagement Email Service
 *
 * Handles sending re-engagement emails to inactive users
 * and satisfaction surveys to active users.
 *
 * Issue #445: Engagement and re-engagement email templates
 */

import { Op } from "sequelize";
import { enqueueTemplateEmail, EmailPriority } from "./emailQueueService.js";
import { InactiveUserReengagement } from "../emails/templates/engagement/InactiveUserReengagement.jsx";
import { SatisfactionSurvey } from "../emails/templates/engagement/SatisfactionSurvey.jsx";
import { SurveyThankYou } from "../emails/templates/engagement/SurveyThankYou.jsx";
import { shouldSendNotification, NotificationType } from "../utils/notificationChecker.js";
import { getTopIdeas } from "./statsService.js";
import User from "../models/User.js";
import Idea from "../models/Idea.js";
import Organization from "../models/Organization.js";
import SurveyToken from "../models/SurveyToken.js";
import { logger } from "../utils/logger.js";

// Configuration defaults (can be overridden by env vars)
const CONFIG = {
  inactiveThresholdDays: parseInt(process.env.INACTIVE_USER_THRESHOLD_DAYS || "30", 10),
  reengagementFrequencyDays: parseInt(process.env.REENGAGEMENT_FREQUENCY_DAYS || "30", 10),
  surveyFrequencyDays: parseInt(process.env.SURVEY_FREQUENCY_DAYS || "90", 10),
  minMembershipDaysForSurvey: parseInt(process.env.MIN_MEMBERSHIP_DAYS_FOR_SURVEY || "30", 10),
  surveyTokenExpiryDays: 30, // Survey tokens expire after 30 days
};

/**
 * Get organization settings for email branding
 */
async function getOrgBranding(organizationId) {
  try {
    const organization = await Organization.findByPk(organizationId);
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";

    return {
      organizationName: organization?.name || "Business Review 360",
      primaryColor: organization?.primaryColor || "#1565c0",
      logoUrl: organization?.logoUrl ? `${frontendUrl}${organization.logoUrl}` : null,
      frontendUrl,
    };
  } catch (error) {
    logger.error("Error getting org branding:", error);
    return {
      organizationName: "Business Review 360",
      primaryColor: "#1565c0",
      logoUrl: null,
      frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",
    };
  }
}

/**
 * Find users who are inactive (haven't logged in for N days)
 */
export async function findInactiveUsers(organizationId = null) {
  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() - CONFIG.inactiveThresholdDays);

  const reengagementCutoff = new Date();
  reengagementCutoff.setDate(reengagementCutoff.getDate() - CONFIG.reengagementFrequencyDays);

  const where = {
    isApproved: true,
    lastActiveAt: { [Op.lt]: thresholdDate },
    [Op.or]: [
      { lastEngagementEmailSent: null },
      { lastEngagementEmailSent: { [Op.lt]: reengagementCutoff } },
    ],
  };

  if (organizationId) {
    where.organizationId = organizationId;
  }

  return User.findAll({ where });
}

/**
 * Get activity stats since a user's last login
 */
async function getActivitySinceLastLogin(userId, organizationId, lastLoginDate) {
  const [newIdeasCount, newImplementationsCount] = await Promise.all([
    Idea.count({
      where: {
        organizationId,
        createdAt: { [Op.gt]: lastLoginDate },
      },
    }),
    Idea.count({
      where: {
        organizationId,
        status: "Implemented",
        updatedAt: { [Op.gt]: lastLoginDate },
      },
    }),
  ]);

  return { newIdeasCount, newImplementationsCount };
}

/**
 * Send re-engagement emails to inactive users
 */
export async function sendReengagementEmails(organizationId = null) {
  logger.info("[Engagement] Starting re-engagement emails...");

  const inactiveUsers = await findInactiveUsers(organizationId);
  logger.info(`[Engagement] Found ${inactiveUsers.length} inactive users`);

  let sent = 0;
  let skipped = 0;

  for (const user of inactiveUsers) {
    try {
      // Check if user wants engagement emails
      const shouldSend = await shouldSendNotification(user.id, NotificationType.ENGAGEMENT_EMAILS);
      if (!shouldSend) {
        logger.info(`[Engagement] Skipping ${user.email} - opted out`);
        skipped++;
        continue;
      }

      const branding = await getOrgBranding(user.organizationId);
      const daysSinceLastLogin = Math.floor(
        (new Date() - new Date(user.lastActiveAt)) / (1000 * 60 * 60 * 24)
      );

      // Get what they missed
      const activity = await getActivitySinceLastLogin(
        user.id,
        user.organizationId,
        user.lastActiveAt
      );

      // Get highlighted ideas
      const endDate = new Date();
      const startDate = new Date(user.lastActiveAt);
      const highlightedIdeas = await getTopIdeas(user.organizationId, startDate, endDate, 3);

      const result = await enqueueTemplateEmail({
        to: user.email,
        subject: `We miss you at ${branding.organizationName}!`,
        template: InactiveUserReengagement,
        templateProps: {
          userName: user.username || user.email.split("@")[0],
          daysSinceLastLogin,
          newIdeasCount: activity.newIdeasCount,
          newImplementationsCount: activity.newImplementationsCount,
          highlightedIdeas,
          loginUrl: `${branding.frontendUrl}/login`,
          browseIdeasUrl: `${branding.frontendUrl}/ideas`,
          submitIdeaUrl: `${branding.frontendUrl}/submit`,
          unsubscribeUrl: `${branding.frontendUrl}/settings/notifications`,
          ...branding,
        },
        categories: ["engagement", "reengagement"],
        type: "user-reengagement",
        priority: EmailPriority.NORMAL,
        organizationId: user.organizationId,
        userId: user.id,
      });

      if (result.success) {
        await user.update({ lastEngagementEmailSent: new Date() });
        sent++;
        logger.info(`[Engagement] Re-engagement email queued for ${user.email}`);
      } else {
        logger.error(`[Engagement] Failed to queue re-engagement email for ${user.email}:`, {
          error: result.error,
        });
      }
    } catch (error) {
      logger.error(`[Engagement] Error sending to ${user.email}:`, error);
    }
  }

  logger.info(`[Engagement] Re-engagement complete: ${sent} sent, ${skipped} skipped`);
  return { sent, skipped };
}

/**
 * Find users eligible for satisfaction surveys
 */
export async function findSurveyEligibleUsers(organizationId = null) {
  const membershipCutoff = new Date();
  membershipCutoff.setDate(membershipCutoff.getDate() - CONFIG.minMembershipDaysForSurvey);

  const surveyCutoff = new Date();
  surveyCutoff.setDate(surveyCutoff.getDate() - CONFIG.surveyFrequencyDays);

  const where = {
    isApproved: true,
    createdAt: { [Op.lt]: membershipCutoff }, // Member for at least N days
    [Op.or]: [{ lastSurveySent: null }, { lastSurveySent: { [Op.lt]: surveyCutoff } }],
  };

  if (organizationId) {
    where.organizationId = organizationId;
  }

  return User.findAll({ where });
}

/**
 * Create a survey token for one-click ratings
 */
export async function createSurveyToken(userId, organizationId, type = "satisfaction") {
  const token = SurveyToken.generateToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + CONFIG.surveyTokenExpiryDays);

  const surveyToken = await SurveyToken.create({
    userId,
    organizationId,
    token,
    type,
    expiresAt,
  });

  return surveyToken;
}

/**
 * Send satisfaction surveys to eligible users
 */
export async function sendSatisfactionSurveys(organizationId = null) {
  logger.info("[Engagement] Starting satisfaction surveys...");

  const eligibleUsers = await findSurveyEligibleUsers(organizationId);
  logger.info(`[Engagement] Found ${eligibleUsers.length} survey-eligible users`);

  let sent = 0;
  let skipped = 0;

  for (const user of eligibleUsers) {
    try {
      // Check if user wants engagement emails (surveys fall under engagement)
      const shouldSend = await shouldSendNotification(user.id, NotificationType.ENGAGEMENT_EMAILS);
      if (!shouldSend) {
        logger.info(`[Engagement] Skipping survey for ${user.email} - opted out`);
        skipped++;
        continue;
      }

      const branding = await getOrgBranding(user.organizationId);

      // Create survey token
      const surveyToken = await createSurveyToken(user.id, user.organizationId, "satisfaction");

      const result = await enqueueTemplateEmail({
        to: user.email,
        // #897: hardcoded product name, NOT the tenant's organizationName.
        // The SatisfactionSurvey targets Business Review 360 itself (it
        // feeds the platform NPS dashboard in SurveysTab.jsx), not the
        // user's tenant. Per-tenant interpolation here produces nonsense
        // subjects for the public sandbox ("How is demo corp working for
        // you?"). The linked /feedback page hardcodes the same string;
        // the email matches it. Tenant logo + colour still flow via
        // the Header template (templateProps.organizationName from branding).
        subject: `Quick question: How is Business Review 360 working for you?`,
        template: SatisfactionSurvey,
        templateProps: {
          userName: user.username || user.email.split("@")[0],
          surveyToken: surveyToken.token,
          ratingBaseUrl: `${branding.frontendUrl}/api/surveys/quick-rate`,
          fullSurveyUrl: `${branding.frontendUrl}/feedback?token=${surveyToken.token}`,
          preferencesUrl: `${branding.frontendUrl}/settings/notifications`,
          ...branding,
        },
        categories: ["engagement", "survey"],
        type: "satisfaction-survey",
        priority: EmailPriority.NORMAL,
        organizationId: user.organizationId,
        userId: user.id,
      });

      if (result.success) {
        await user.update({ lastSurveySent: new Date() });
        sent++;
        logger.info(`[Engagement] Survey queued for ${user.email}`);
      } else {
        await surveyToken.destroy();
        logger.error(`[Engagement] Failed to queue survey for ${user.email}:`, {
          error: result.error,
        });
      }
    } catch (error) {
      logger.error(`[Engagement] Error sending survey to ${user.email}:`, error);
    }
  }

  logger.info(`[Engagement] Surveys complete: ${sent} sent, ${skipped} skipped`);
  return { sent, skipped };
}

/**
 * Send thank you email after survey completion
 */
export async function sendSurveyThankYou(userId, rating = null) {
  const user = await User.findByPk(userId);

  if (!user) {
    throw new Error("User not found");
  }

  const branding = await getOrgBranding(user.organizationId);

  const result = await enqueueTemplateEmail({
    to: user.email,
    // #897: paired with the SatisfactionSurvey subject above, this
    // confirmation also targets the Business Review 360 product survey,
    // not the user's tenant. Tenant branding stays on the Header/Footer
    // visual chrome via templateProps below.
    subject: `Thank you for your feedback - Business Review 360`,
    template: SurveyThankYou,
    templateProps: {
      userName: user.username || user.email.split("@")[0],
      rating,
      browseIdeasUrl: `${branding.frontendUrl}/ideas`,
      ...branding,
    },
    categories: ["engagement", "survey-thankyou"],
    type: "survey-thank-you",
    priority: EmailPriority.NORMAL,
    organizationId: user.organizationId,
    userId: user.id,
  });

  if (result.success) {
    logger.info(`[Engagement] Thank you email queued for ${user.email}`);
  } else {
    logger.error(`[Engagement] Failed to queue thank you email for ${user.email}:`, {
      error: result.error,
    });
  }
}

/**
 * Cleanup expired survey tokens
 */
export async function cleanupExpiredTokens() {
  const deleted = await SurveyToken.destroy({
    where: {
      expiresAt: { [Op.lt]: new Date() },
    },
  });

  logger.info(`[Engagement] Cleaned up ${deleted} expired survey tokens`);
  return deleted;
}

export default {
  findInactiveUsers,
  sendReengagementEmails,
  findSurveyEligibleUsers,
  createSurveyToken,
  sendSatisfactionSurveys,
  sendSurveyThankYou,
  cleanupExpiredTokens,
};
