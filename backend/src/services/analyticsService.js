/**
 * AnalyticsService: HTTP-agnostic business logic for the analytics dashboard.
 *
 * Issue #485, Phase 3. Design spec:
 *   docs/superpowers/specs/2026-04-29-485-domain-service-layer-design.md
 *
 * ctx shape: { organizationId }
 */

import { Op } from "sequelize";
import Idea from "../models/Idea.js";
import User from "../models/User.js";
import Comment from "../models/Comment.js";
import Vote from "../models/Vote.js";
import { calculateAggregateSavings } from "../utils/timeSavingsCalculator.js";
import { ForbiddenError } from "./errors.js";
import { PRIORITY_THRESHOLD } from "../constants/priorityMatrix.js";
import { STATUS_MAPPING } from "../constants/ideaStatuses.js";
import { logger } from "../utils/logger.js";

function computeTrend(current, previous) {
  const direction = current > previous ? "up" : current < previous ? "down" : "flat";
  const pct = previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;
  return { direction, pct };
}

/**
 * Bucket raw per-status count rows through STATUS_MAPPING. Statuses outside
 * the canonical vocabulary land in "Other" instead of being dropped (#951):
 * a status writable to the DB but invisible to every aggregate is how the
 * board report ended up asserting 0 implemented beside an Implemented chip.
 *
 * @param {Array<{status: string, count: string|number}>} rows
 * @returns {{counts: Record<string, number>, unmapped: string[]}}
 */
export function bucketStatusCounts(rows) {
  const counts = {};
  const unmapped = [];
  rows.forEach((item) => {
    const mappedStatus = STATUS_MAPPING[item.status] || "Other";
    if (!STATUS_MAPPING[item.status]) unmapped.push(item.status);
    counts[mappedStatus] = (counts[mappedStatus] || 0) + (parseInt(item.count, 10) || 0);
  });
  return { counts, unmapped };
}

/**
 * Fetch the full analytics dashboard for an organisation.
 *
 * @param {{ organizationId: string }} ctx
 * @returns {object} Full analytics payload
 */
export async function getDashboardAnalytics(ctx) {
  const { organizationId } = ctx;

  if (!organizationId) {
    throw new ForbiddenError("User account is missing organisation information");
  }

  const ideasByStatusRaw = await Idea.findAll({
    attributes: ["status", [Idea.sequelize.fn("COUNT", Idea.sequelize.col("id")), "count"]],
    where: { organizationId },
    group: ["status"],
    raw: true,
  });

  const { counts: statusCounts, unmapped: unmappedStatuses } = bucketStatusCounts(ideasByStatusRaw);
  if (unmappedStatuses.length > 0) {
    // #951: a status outside the canonical vocabulary must surface, not vanish.
    // It renders as the "Other" bucket and this warning names the raw values.
    logger.warn("[Analytics] Ideas carry statuses outside the canonical vocabulary", {
      organizationId,
      unmappedStatuses,
    });
  }
  const ideasByStatus = Object.keys(statusCounts).map((status) => ({
    status,
    count: statusCounts[status],
  }));

  const ideasByCategory = await Idea.findAll({
    attributes: ["category", [Idea.sequelize.fn("COUNT", Idea.sequelize.col("id")), "count"]],
    where: { organizationId, category: { [Op.ne]: null } },
    group: ["category"],
    raw: true,
    order: [[Idea.sequelize.fn("COUNT", Idea.sequelize.col("id")), "DESC"]],
  });

  // #952: the frontend titles this series "Last 30 Days", so the window must
  // actually be 30 days. The previous unfiltered query combined with the
  // frontend's slice(-30) took the last 30 DAYS-WITH-DATA, which for a sparse
  // tenant rendered months under a 30-day title.
  // Aligned to UTC start-of-day minus 29 days so the query window matches
  // the frontend's 30-calendar-day zero-filled display window exactly (a
  // mid-day cutoff produced a partial first bucket the display discarded).
  const trendWindowStart = new Date(
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) -
      29 * 24 * 60 * 60 * 1000
  );
  const ideasOverTime = await Idea.findAll({
    attributes: [
      [Idea.sequelize.fn("DATE", Idea.sequelize.col("createdAt")), "date"],
      [Idea.sequelize.fn("COUNT", Idea.sequelize.col("id")), "count"],
    ],
    where: { organizationId, createdAt: { [Op.gte]: trendWindowStart } },
    group: [Idea.sequelize.fn("DATE", Idea.sequelize.col("createdAt"))],
    order: [[Idea.sequelize.fn("DATE", Idea.sequelize.col("createdAt")), "ASC"]],
    raw: true,
  });

  const topIdeasByVotes = await Idea.sequelize.query(
    `SELECT
      i.id,
      i.title,
      i.status,
      i.category,
      COUNT(v.id) as "voteCount"
    FROM "Ideas" i
    LEFT JOIN "Votes" v ON i.id = v."ideaId"
    WHERE i."organizationId" = :organizationId
    GROUP BY i.id, i.title, i.status, i.category
    ORDER BY COUNT(v.id) DESC
    LIMIT 10`,
    { replacements: { organizationId }, type: Idea.sequelize.QueryTypes.SELECT }
  );

  const totalIdeas = await Idea.count({ where: { organizationId } });
  const totalUsers = await User.count({ where: { organizationId } });
  const totalComments = await Comment.count({
    include: [{ model: Idea, as: "idea", where: { organizationId }, attributes: [] }],
  });
  const totalVotes = await Vote.count({
    include: [{ model: Idea, as: "idea", where: { organizationId }, attributes: [] }],
  });

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

  const activeUsersResult = await Idea.sequelize.query(
    `SELECT COUNT(DISTINCT user_id) as count FROM (
      SELECT "authorId" as user_id FROM "Ideas" WHERE "createdAt" >= :thirtyDaysAgo AND "organizationId" = :organizationId
      UNION
      SELECT c."authorId" as user_id FROM "Comments" c
        INNER JOIN "Ideas" i ON c."ideaId" = i.id
        WHERE c."createdAt" >= :thirtyDaysAgo AND i."organizationId" = :organizationId
      UNION
      SELECT v."userId" as user_id FROM "Votes" v
        INNER JOIN "Ideas" i ON v."ideaId" = i.id
        WHERE v."createdAt" >= :thirtyDaysAgo AND i."organizationId" = :organizationId
    ) as active_users`,
    { replacements: { thirtyDaysAgo, organizationId }, type: Idea.sequelize.QueryTypes.SELECT }
  );
  const activeUsers = parseInt(activeUsersResult[0].count);

  const prevActiveUsersResult = await Idea.sequelize.query(
    `SELECT COUNT(DISTINCT user_id) as count FROM (
      SELECT "authorId" as user_id FROM "Ideas" WHERE "createdAt" >= :sixtyDaysAgo AND "createdAt" < :thirtyDaysAgo AND "organizationId" = :organizationId
      UNION
      SELECT c."authorId" as user_id FROM "Comments" c
        INNER JOIN "Ideas" i ON c."ideaId" = i.id
        WHERE c."createdAt" >= :sixtyDaysAgo AND c."createdAt" < :thirtyDaysAgo AND i."organizationId" = :organizationId
      UNION
      SELECT v."userId" as user_id FROM "Votes" v
        INNER JOIN "Ideas" i ON v."ideaId" = i.id
        WHERE v."createdAt" >= :sixtyDaysAgo AND v."createdAt" < :thirtyDaysAgo AND i."organizationId" = :organizationId
    ) as active_users`,
    {
      replacements: { thirtyDaysAgo, sixtyDaysAgo, organizationId },
      type: Idea.sequelize.QueryTypes.SELECT,
    }
  );
  const prevActiveUsers = parseInt(prevActiveUsersResult[0].count);

  const newIdeasThisPeriod = await Idea.count({
    where: { organizationId, createdAt: { [Op.gte]: thirtyDaysAgo } },
  });
  const newIdeasPreviousPeriod = await Idea.count({
    where: { organizationId, createdAt: { [Op.gte]: sixtyDaysAgo, [Op.lt]: thirtyDaysAgo } },
  });

  const stuckIdeas = await Idea.sequelize.query(
    `SELECT i.id, i.slug, i.title, i."updatedAt",
      EXTRACT(DAY FROM NOW() - i."updatedAt")::int as "daysSinceUpdate",
      COUNT(v.id)::int as "voteCount"
    FROM "Ideas" i
    LEFT JOIN "Votes" v ON i.id = v."ideaId"
    WHERE i."organizationId" = :organizationId
      AND i.status = 'Reviewing'
      AND i."updatedAt" < :thirtyDaysAgo
    GROUP BY i.id, i.slug, i.title, i."updatedAt"
    ORDER BY "daysSinceUpdate" DESC
    LIMIT 10`,
    { replacements: { organizationId, thirtyDaysAgo }, type: Idea.sequelize.QueryTypes.SELECT }
  );

  const ideasNeedingAttention = stuckIdeas.length;

  const completedIdeas = await Idea.count({
    where: { organizationId, status: { [Op.in]: ["Approved", "Complete"] } },
  });

  const userEngagement = await Idea.sequelize.query(
    `SELECT
      u.id,
      u.username,
      COUNT(i.id) as "ideaCount"
    FROM "Users" u
    LEFT JOIN "Ideas" i ON u.id = i."authorId" AND i."organizationId" = :organizationId
    WHERE u."organizationId" = :organizationId
    GROUP BY u.id, u.username
    ORDER BY COUNT(i.id) DESC
    LIMIT 10`,
    { replacements: { organizationId }, type: Idea.sequelize.QueryTypes.SELECT }
  );

  const resolvedIdeas = await Idea.findAll({
    attributes: ["id", "createdAt", "updatedAt", "status"],
    where: { organizationId, status: { [Op.in]: ["Approved", "Complete"] } },
    raw: true,
  });
  const avgTimeToResolution =
    resolvedIdeas.length > 0
      ? resolvedIdeas.reduce((sum, idea) => {
          const days = Math.floor(
            (new Date(idea.updatedAt) - new Date(idea.createdAt)) / (1000 * 60 * 60 * 24)
          );
          return sum + days;
        }, 0) / resolvedIdeas.length
      : 0;

  const wouldSpendOwnMoney = await Idea.count({
    where: { organizationId, wouldSpendOwnMoney: true },
  });

  const avgCommentsPerIdea = totalIdeas > 0 ? (totalComments / totalIdeas).toFixed(2) : 0;
  const avgVotesPerIdea = totalIdeas > 0 ? (totalVotes / totalIdeas).toFixed(2) : 0;

  const privateIdeas = await Idea.count({ where: { organizationId, isPrivate: true } });
  const publicIdeas = await Idea.count({ where: { organizationId, isPrivate: false } });

  const potentialStatuses = ["Reviewing", "In Progress", "Approved", "Open"];
  const potentialTimeSavedResult = await Idea.sum("timeSavedMinutes", {
    where: { organizationId, status: { [Op.in]: potentialStatuses } },
  });
  const potentialTimeSaved = potentialTimeSavedResult || 0;

  const actualTimeSavedResult = await Idea.sum("timeSavedMinutes", {
    where: { organizationId, status: "Complete" },
  });
  const actualTimeSaved = actualTimeSavedResult || 0;

  const potentialIdeasWithFrequency = await Idea.findAll({
    where: {
      organizationId,
      status: { [Op.in]: potentialStatuses },
      timeSavedMinutes: { [Op.ne]: null },
      frequencyCount: { [Op.ne]: null },
      frequencyPeriod: { [Op.ne]: null },
    },
    attributes: ["timeSavedMinutes", "frequencyCount", "frequencyPeriod"],
    raw: true,
  });
  const potentialAnnualSavings = calculateAggregateSavings(potentialIdeasWithFrequency);

  const completedIdeasWithFrequency = await Idea.findAll({
    where: {
      organizationId,
      status: "Complete",
      timeSavedMinutes: { [Op.ne]: null },
      frequencyCount: { [Op.ne]: null },
      frequencyPeriod: { [Op.ne]: null },
    },
    attributes: ["timeSavedMinutes", "frequencyCount", "frequencyPeriod"],
    raw: true,
  });
  const actualAnnualSavings = calculateAggregateSavings(completedIdeasWithFrequency);

  return {
    summary: {
      totalIdeas,
      totalUsers,
      totalComments,
      totalVotes,
      activeUsers,
      ideasNeedingAttention,
      completionRate: totalIdeas > 0 ? ((completedIdeas / totalIdeas) * 100).toFixed(1) : 0,
      avgTimeToResolution: avgTimeToResolution.toFixed(1),
      wouldSpendOwnMoney,
      avgCommentsPerIdea,
      avgVotesPerIdea,
      privateIdeas,
      publicIdeas,
      potentialTimeSaved,
      actualTimeSaved,
      potentialAnnualSavings,
      actualAnnualSavings,
      trends: {
        totalIdeas: computeTrend(newIdeasThisPeriod, newIdeasPreviousPeriod),
        activeUsers: computeTrend(activeUsers, prevActiveUsers),
      },
    },
    stuckIdeas,
    ideasByStatus,
    ideasByCategory,
    ideasOverTime,
    topIdeasByVotes,
    userEngagement,
  };
}

/**
 * Fetch priority matrix data (impact vs effort quadrant analysis).
 *
 * @param {{ organizationId: string }} ctx
 * @returns {{ ideas: object[], quadrants: object, totalIdeas: number }}
 */
export async function getPriorityMatrix(ctx) {
  const { organizationId } = ctx;

  if (!organizationId) {
    throw new ForbiddenError("User account is missing organisation information");
  }

  const ideas = await Idea.sequelize.query(
    `SELECT
      i.id,
      i.slug,
      i.title,
      i.status,
      i.category,
      i."impactScore",
      i."effortScore",
      i."roiEstimate",
      i."implementationCost",
      i."timeSavedMinutes",
      i."frequencyCount",
      i."frequencyPeriod",
      i."matrixPositionX",
      i."matrixPositionY",
      COUNT(v.id) as "voteCount"
    FROM "Ideas" i
    LEFT JOIN "Votes" v ON i.id = v."ideaId"
    WHERE i."organizationId" = :organizationId
    GROUP BY i.id, i.slug, i.title, i.status, i.category, i."impactScore", i."effortScore", i."roiEstimate", i."implementationCost", i."timeSavedMinutes", i."frequencyCount", i."frequencyPeriod", i."matrixPositionX", i."matrixPositionY"
    ORDER BY i."createdAt" DESC`,
    { replacements: { organizationId }, type: Idea.sequelize.QueryTypes.SELECT }
  );

  const quadrants = {
    "Quick Wins": 0,
    Strategic: 0,
    "Fill-ins": 0,
    "Thankless Tasks": 0,
  };

  ideas.forEach((idea) => {
    const impact = idea.impactScore || 5;
    const effort = idea.effortScore || 5;
    if (impact > PRIORITY_THRESHOLD && effort <= PRIORITY_THRESHOLD) quadrants["Quick Wins"]++;
    else if (impact > PRIORITY_THRESHOLD && effort > PRIORITY_THRESHOLD) quadrants["Strategic"]++;
    else if (impact <= PRIORITY_THRESHOLD && effort <= PRIORITY_THRESHOLD) quadrants["Fill-ins"]++;
    else quadrants["Thankless Tasks"]++;
  });

  return { ideas, quadrants, totalIdeas: ideas.length };
}
