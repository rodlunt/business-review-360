/**
 * Stats Service
 *
 * Provides aggregated statistics for digest emails.
 * Handles weekly, monthly, and quarterly data aggregation.
 *
 * Issue #444: Digest and summary email templates
 */

import { Op, fn, col, literal } from "sequelize";
import Idea from "../models/Idea.js";
import Comment from "../models/Comment.js";
import Vote from "../models/Vote.js";
import User from "../models/User.js";

/**
 * Get date ranges for different periods
 */
export function getDateRanges() {
  const now = new Date();

  // Week start/end (Monday-Sunday)
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1) - 7); // Last Monday
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  // Month start/end (last month)
  const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  monthEnd.setHours(23, 59, 59, 999);

  // Quarter calculation
  const currentQuarter = Math.floor(now.getMonth() / 3);
  const lastQuarter = currentQuarter === 0 ? 3 : currentQuarter - 1;
  const lastQuarterYear = currentQuarter === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const quarterStart = new Date(lastQuarterYear, lastQuarter * 3, 1);
  const quarterEnd = new Date(lastQuarterYear, (lastQuarter + 1) * 3, 0);
  quarterEnd.setHours(23, 59, 59, 999);

  return {
    week: { start: weekStart, end: weekEnd },
    month: { start: monthStart, end: monthEnd },
    quarter: {
      start: quarterStart,
      end: quarterEnd,
      quarter: lastQuarter + 1,
      year: lastQuarterYear,
    },
  };
}

/**
 * Get user activity stats for a period
 */
export async function getUserActivityStats(userId, organizationId, startDate, endDate) {
  const [ideasSubmitted, commentsMade] = await Promise.all([
    Idea.count({
      where: {
        userId,
        organizationId,
        createdAt: { [Op.between]: [startDate, endDate] },
      },
    }),
    Comment.count({
      where: {
        userId,
        createdAt: { [Op.between]: [startDate, endDate] },
      },
      include: [
        {
          model: Idea,
          where: { organizationId },
          attributes: [],
        },
      ],
    }),
  ]);

  return { ideasSubmitted, commentsMade };
}

/**
 * Get organization idea stats for a period
 */
export async function getOrganizationIdeaStats(organizationId, startDate, endDate) {
  const ideas = await Idea.findAll({
    where: {
      organizationId,
      createdAt: { [Op.between]: [startDate, endDate] },
    },
    attributes: ["status"],
  });

  const stats = {
    submitted: ideas.length,
    approved: ideas.filter((i) => i.status === "Approved").length,
    implemented: ideas.filter((i) => i.status === "Implemented").length,
    rejected: ideas.filter((i) => i.status === "Rejected").length,
    reviewing: ideas.filter((i) => i.status === "Reviewing").length,
  };

  return stats;
}

/**
 * Get top contributors for a period
 */
export async function getTopContributors(organizationId, startDate, endDate, limit = 5) {
  // Get idea counts per user
  const ideaCounts = await Idea.findAll({
    where: {
      organizationId,
      createdAt: { [Op.between]: [startDate, endDate] },
    },
    attributes: [
      "userId",
      [fn("COUNT", col("id")), "ideasCount"],
      [
        fn("SUM", literal("CASE WHEN status = 'Implemented' THEN 1 ELSE 0 END")),
        "implementedCount",
      ],
    ],
    group: ["userId"],
    raw: true,
  });

  // Get comment counts per user
  const commentCounts = await Comment.findAll({
    where: {
      createdAt: { [Op.between]: [startDate, endDate] },
    },
    include: [
      {
        model: Idea,
        where: { organizationId },
        attributes: [],
      },
    ],
    attributes: ["userId", [fn("COUNT", col("Comment.id")), "commentsCount"]],
    group: ["userId"],
    raw: true,
  });

  // Merge idea and comment counts
  const contributorMap = {};

  ideaCounts.forEach((ic) => {
    contributorMap[ic.userId] = {
      userId: ic.userId,
      ideasCount: parseInt(ic.ideasCount) || 0,
      implementedCount: parseInt(ic.implementedCount) || 0,
      commentsCount: 0,
    };
  });

  commentCounts.forEach((cc) => {
    if (contributorMap[cc.userId]) {
      contributorMap[cc.userId].commentsCount = parseInt(cc.commentsCount) || 0;
    } else {
      contributorMap[cc.userId] = {
        userId: cc.userId,
        ideasCount: 0,
        implementedCount: 0,
        commentsCount: parseInt(cc.commentsCount) || 0,
      };
    }
  });

  // Score and sort contributors
  const contributors = Object.values(contributorMap);
  contributors.forEach((c) => {
    c.score = c.ideasCount * 10 + c.implementedCount * 20 + c.commentsCount * 2;
  });
  contributors.sort((a, b) => b.score - a.score);

  // Get user names for top contributors
  const topContributorIds = contributors.slice(0, limit).map((c) => c.userId);
  const users = await User.findAll({
    where: { id: topContributorIds },
    attributes: ["id", "username", "email"],
  });

  const userMap = {};
  users.forEach((u) => {
    userMap[u.id] = u.username || u.email?.split("@")[0] || "Anonymous";
  });

  return contributors.slice(0, limit).map((c) => ({
    name: userMap[c.userId] || "Anonymous",
    ideasCount: c.ideasCount,
    commentsCount: c.commentsCount,
    implementedCount: c.implementedCount,
  }));
}

/**
 * Get engagement metrics for a period
 */
export async function getEngagementMetrics(organizationId, startDate, endDate) {
  const [totalComments, totalVotes, activeUsers, totalUsers] = await Promise.all([
    Comment.count({
      where: {
        createdAt: { [Op.between]: [startDate, endDate] },
      },
      include: [
        {
          model: Idea,
          where: { organizationId },
          attributes: [],
        },
      ],
    }),
    Vote.count({
      where: {
        createdAt: { [Op.between]: [startDate, endDate] },
      },
      include: [
        {
          model: Idea,
          where: { organizationId },
          attributes: [],
        },
      ],
    }),
    User.count({
      where: {
        organizationId,
        lastActiveAt: { [Op.between]: [startDate, endDate] },
      },
    }),
    User.count({
      where: { organizationId, isApproved: true },
    }),
  ]);

  const activeUserPercent = totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0;

  return {
    totalComments,
    totalVotes,
    activeUsers,
    totalUsers,
    activeUserPercent,
  };
}

/**
 * Get top/trending ideas for a period
 */
export async function getTopIdeas(organizationId, startDate, endDate, limit = 5) {
  const ideas = await Idea.findAll({
    where: {
      organizationId,
      createdAt: { [Op.between]: [startDate, endDate] },
    },
    include: [{ model: User, attributes: ["id", "username", "email"] }],
    order: [["createdAt", "DESC"]],
    limit: limit * 2, // Get extra to filter
  });

  // Get comment and vote counts for each idea
  const ideaIds = ideas.map((i) => i.id);
  const [commentCounts, voteCounts] = await Promise.all([
    Comment.findAll({
      where: { ideaId: ideaIds },
      attributes: ["ideaId", [fn("COUNT", col("id")), "count"]],
      group: ["ideaId"],
      raw: true,
    }),
    Vote.findAll({
      where: { ideaId: ideaIds },
      attributes: ["ideaId", [fn("COUNT", col("id")), "count"]],
      group: ["ideaId"],
      raw: true,
    }),
  ]);

  const commentMap = {};
  commentCounts.forEach((c) => {
    commentMap[c.ideaId] = parseInt(c.count) || 0;
  });

  const voteMap = {};
  voteCounts.forEach((v) => {
    voteMap[v.ideaId] = parseInt(v.count) || 0;
  });

  // Score and sort ideas
  const scoredIdeas = ideas.map((idea) => ({
    idea,
    commentCount: commentMap[idea.id] || 0,
    voteCount: voteMap[idea.id] || 0,
    score: (commentMap[idea.id] || 0) * 3 + (voteMap[idea.id] || 0),
  }));

  scoredIdeas.sort((a, b) => b.score - a.score);

  return scoredIdeas.slice(0, limit).map((si) => ({
    id: si.idea.id,
    title: si.idea.title,
    url: `/idea/${si.idea.slug || si.idea.id}`,
    authorName: si.idea.User?.username || si.idea.User?.email?.split("@")[0] || "Anonymous",
    status: si.idea.status,
    commentCount: si.commentCount,
    voteCount: si.voteCount,
    timeSavedMinutes: si.idea.timeSavedMinutes,
  }));
}

/**
 * Get recently implemented ideas
 */
export async function getRecentImplementations(organizationId, startDate, endDate, limit = 5) {
  const ideas = await Idea.findAll({
    where: {
      organizationId,
      status: "Implemented",
      updatedAt: { [Op.between]: [startDate, endDate] },
    },
    include: [{ model: User, attributes: ["id", "username", "email"] }],
    order: [["updatedAt", "DESC"]],
    limit,
  });

  return ideas.map((idea) => ({
    id: idea.id,
    title: idea.title,
    url: `/idea/${idea.slug || idea.id}`,
    authorName: idea.User?.username || idea.User?.email?.split("@")[0] || "Anonymous",
    timeSavedMinutes: idea.actualTimeSavedMinutes || idea.timeSavedMinutes,
    impact: idea.orgImpact,
  }));
}

/**
 * Get pending review count
 */
export async function getPendingReviewCount(organizationId) {
  return Idea.count({
    where: {
      organizationId,
      status: "Reviewing",
    },
  });
}

/**
 * Get total time saved from implemented ideas
 */
export async function getTotalTimeSaved(organizationId, startDate = null, endDate = null) {
  const where = {
    organizationId,
    status: "Implemented",
  };

  if (startDate && endDate) {
    where.updatedAt = { [Op.between]: [startDate, endDate] };
  }

  const result = await Idea.findOne({
    where,
    attributes: [
      [
        fn("SUM", fn("COALESCE", col("actualTimeSavedMinutes"), col("timeSavedMinutes"), 0)),
        "totalMinutes",
      ],
    ],
    raw: true,
  });

  return parseInt(result?.totalMinutes) || 0;
}

/**
 * Get watched ideas with updates for a user
 */
export async function getWatchedIdeasUpdates(userId, organizationId, since) {
  // This requires the IdeaSubscription model from Issue #443
  // For now, return ideas the user created or commented on with recent activity
  const userIdeas = await Idea.findAll({
    where: {
      organizationId,
      userId,
      updatedAt: { [Op.gte]: since },
    },
    include: [
      {
        model: Comment,
        limit: 1,
        order: [["createdAt", "DESC"]],
        include: [{ model: User, attributes: ["username"] }],
      },
    ],
    order: [["updatedAt", "DESC"]],
    limit: 10,
  });

  return userIdeas.map((idea) => ({
    id: idea.id,
    title: idea.title,
    url: `/idea/${idea.slug || idea.id}`,
    status: idea.status,
    newCommentCount: idea.Comments?.length || 0,
    latestUpdate: idea.Comments?.[0]?.User?.username
      ? `${idea.Comments[0].User.username}: "${idea.Comments[0].text?.substring(0, 50)}..."`
      : `Status: ${idea.status}`,
  }));
}

/**
 * Calculate cost savings estimate
 * @param {number} totalMinutes - Total time saved in minutes
 * @param {number} hourlyRate - Hourly rate (default $30)
 */
export function calculateCostSavings(totalMinutes, hourlyRate = 30) {
  const hours = totalMinutes / 60;
  return Math.round(hours * hourlyRate);
}

/**
 * Get previous period stats for trend comparison
 */
export async function getPreviousPeriodStats(organizationId, periodType = "month") {
  const ranges = getDateRanges();
  let startDate, endDate;

  if (periodType === "month") {
    // Get stats from 2 months ago
    startDate = new Date(ranges.month.start);
    startDate.setMonth(startDate.getMonth() - 1);
    endDate = new Date(ranges.month.start);
    endDate.setDate(endDate.getDate() - 1);
  } else if (periodType === "week") {
    // Get stats from 2 weeks ago
    startDate = new Date(ranges.week.start);
    startDate.setDate(startDate.getDate() - 7);
    endDate = new Date(ranges.week.end);
    endDate.setDate(endDate.getDate() - 7);
  }

  return getOrganizationIdeaStats(organizationId, startDate, endDate);
}

/**
 * Calculate trend percentage
 */
export function calculateTrend(current, previous) {
  if (previous === 0) {
    return current > 0 ? "+100%" : "0%";
  }
  const change = Math.round(((current - previous) / previous) * 100);
  return change >= 0 ? `+${change}%` : `${change}%`;
}

export default {
  getDateRanges,
  getUserActivityStats,
  getOrganizationIdeaStats,
  getTopContributors,
  getEngagementMetrics,
  getTopIdeas,
  getRecentImplementations,
  getPendingReviewCount,
  getTotalTimeSaved,
  getWatchedIdeasUpdates,
  calculateCostSavings,
  getPreviousPeriodStats,
  calculateTrend,
};
