import { sequelize } from "./models/index.js";
import { logger } from "./utils/logger.js";
/* eslint-disable no-unused-vars */
// Named imports required for sequelize.sync() model registration (see test syncModelsComplete.test.js).
import User from "./models/User.js";
import Idea from "./models/Idea.js";
import Comment from "./models/Comment.js";
import Vote from "./models/Vote.js";
import CommentVote from "./models/CommentVote.js";
import Category from "./models/Category.js";
import Setting from "./models/Setting.js";
import Organization from "./models/Organization.js";
import NotificationPreferences from "./models/NotificationPreferences.js";
import IdeaSubscription from "./models/IdeaSubscription.js";
import Survey from "./models/Survey.js";
import SurveyToken from "./models/SurveyToken.js";
import EmailQueue from "./models/EmailQueue.js";
import EmailLog from "./models/EmailLog.js";
import EmailAnalytics from "./models/EmailAnalytics.js";
import UnsubscribeToken from "./models/UnsubscribeToken.js";
import UserSession from "./models/UserSession.js";
import CommentTemplate from "./models/CommentTemplate.js";
import SavedFilter from "./models/SavedFilter.js";
import OAuthLink from "./models/OAuthLink.js";
import UserOrganizationMembership from "./models/UserOrganizationMembership.js";
import Consultant from "./models/Consultant.js";
import ConsultantInvite from "./models/ConsultantInvite.js";
import ConsultantPayment from "./models/ConsultantPayment.js";
import CommissionRun from "./models/CommissionRun.js";
import MagicLinkToken from "./models/MagicLinkToken.js";
import ErrorEvent from "./models/ErrorEvent.js";
import MetricsSample from "./models/MetricsSample.js";
/* eslint-enable no-unused-vars */

export async function syncDb(force = false) {
  // Sync is disabled in development when using manual schema loading
  // Tables are created via db/clean_minimal_schema.sql
  // Only sync in test mode or when explicitly needed
  if (process.env.NODE_ENV === "test" || process.env.ENABLE_SEQUELIZE_SYNC === "true") {
    await sequelize.sync({ force });
  } else {
    logger.info("Skipping Sequelize sync (using manual schema)");
  }

  // All seed data (including organizations) is now loaded via PostgreSQL init scripts
  // See: db/clean_minimal_schema.sql and db/clean_test_data.sql
}

if (process.env.NODE_ENV === "sync") {
  syncDb(true).then(() => process.exit(0));
}
