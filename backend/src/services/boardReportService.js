/**
 * BoardReportService: data layer for the executive board report.
 *
 * Issue #450. Reshapes existing analytics data into a board-ready one-pager
 * format with configurable period and ROI inputs.
 *
 * ctx shape: { organizationId, period, startDate, endDate, hourlyRate }
 */

import { Op } from "sequelize";
import Idea from "../models/Idea.js";
import User from "../models/User.js";
import Organization from "../models/Organization.js";
import { calculateAggregateSavings } from "../utils/timeSavingsCalculator.js";
import { ForbiddenError, NotFoundError } from "./errors.js";
import { logger } from "../utils/logger.js";
import { COMPLETE_STATUSES } from "../constants/ideaStatuses.js";
import { bucketStatusCounts } from "./analyticsService.js";

function periodBounds(period, startDate, endDate) {
  const now = new Date();
  switch (period) {
    case "month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { start, end: now, prevStart, prevEnd: start };
    }
    case "quarter": {
      const q = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), q * 3, 1);
      const prevStart = new Date(now.getFullYear(), (q - 1) * 3, 1);
      const prevEnd = new Date(now.getFullYear(), q * 3, 1);
      return { start, end: now, prevStart, prevEnd };
    }
    case "year": {
      const start = new Date(now.getFullYear(), 0, 1);
      const prevStart = new Date(now.getFullYear() - 1, 0, 1);
      const prevEnd = new Date(now.getFullYear(), 0, 1);
      return { start, end: now, prevStart, prevEnd };
    }
    case "last-month": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 1);
      const prevStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      return { start, end, prevStart, prevEnd: start };
    }
    case "ytd": {
      const start = new Date(now.getFullYear(), 0, 1);
      const prevStart = new Date(now.getFullYear() - 1, 0, 1);
      const prevEnd = new Date(
        now.getFullYear() - 1,
        now.getMonth(),
        now.getDate(),
        now.getHours(),
        now.getMinutes(),
        now.getSeconds()
      );
      return { start, end: now, prevStart, prevEnd };
    }
    case "q1": {
      const y = now.getFullYear();
      return {
        start: new Date(y, 0, 1),
        end: new Date(y, 3, 1),
        prevStart: new Date(y - 1, 0, 1),
        prevEnd: new Date(y - 1, 3, 1),
      };
    }
    case "q2": {
      const y = now.getFullYear();
      return {
        start: new Date(y, 3, 1),
        end: new Date(y, 6, 1),
        prevStart: new Date(y - 1, 3, 1),
        prevEnd: new Date(y - 1, 6, 1),
      };
    }
    case "q3": {
      const y = now.getFullYear();
      return {
        start: new Date(y, 6, 1),
        end: new Date(y, 9, 1),
        prevStart: new Date(y - 1, 6, 1),
        prevEnd: new Date(y - 1, 9, 1),
      };
    }
    case "q4": {
      const y = now.getFullYear();
      return {
        start: new Date(y, 9, 1),
        end: new Date(y + 1, 0, 1),
        prevStart: new Date(y - 1, 9, 1),
        prevEnd: new Date(y, 0, 1),
      };
    }
    case "last-year": {
      const start = new Date(now.getFullYear() - 1, 0, 1);
      const end = new Date(now.getFullYear(), 0, 1);
      return { start, end, prevStart: new Date(now.getFullYear() - 2, 0, 1), prevEnd: start };
    }
    case "custom": {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const duration = end - start;
      const prevStart = new Date(start - duration);
      return { start, end, prevStart, prevEnd: start };
    }
    default: {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 1);
      return {
        start,
        end,
        prevStart: new Date(now.getFullYear(), now.getMonth() - 2, 1),
        prevEnd: start,
      };
    }
  }
}

function computeTrend(current, previous) {
  const direction = current > previous ? "up" : current < previous ? "down" : "flat";
  const pct = previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;
  return { current, previous, direction, pct };
}

export async function getBoardReport({
  organizationId,
  period = "quarter",
  startDate,
  endDate,
  hourlyRate = 30,
}) {
  if (!organizationId) throw new ForbiddenError("Missing organisation context");

  const rate = parseFloat(hourlyRate) || 30;
  const { start, end, prevStart, prevEnd } = periodBounds(period, startDate, endDate);

  const org = await Organization.findOne({
    where: { organizationId },
    attributes: ["organizationId", "organizationName", "logoUrl", "primaryColor"],
  });
  if (!org) throw new NotFoundError("Organisation not found");

  // --- Executive summary counts ---
  const [totalIdeasCurrent, totalIdeasPrev, implementedCurrent, implementedPrev, totalUsers] =
    await Promise.all([
      Idea.count({ where: { organizationId, createdAt: { [Op.gte]: start, [Op.lte]: end } } }),
      Idea.count({
        where: { organizationId, createdAt: { [Op.gte]: prevStart, [Op.lte]: prevEnd } },
      }),
      Idea.count({
        where: {
          organizationId,
          status: { [Op.in]: COMPLETE_STATUSES },
          updatedAt: { [Op.gte]: start, [Op.lte]: end },
        },
      }),
      Idea.count({
        where: {
          organizationId,
          status: { [Op.in]: COMPLETE_STATUSES },
          updatedAt: { [Op.gte]: prevStart, [Op.lte]: prevEnd },
        },
      }),
      User.count({ where: { organizationId } }),
    ]);

  // Active users in period (any interaction)
  const [activeResult, prevActiveResult] = await Promise.all([
    Idea.sequelize.query(
      `SELECT COUNT(DISTINCT user_id) as count FROM (
        SELECT "authorId" as user_id FROM "Ideas" WHERE "createdAt" >= :start AND "createdAt" <= :end AND "organizationId" = :organizationId
        UNION
        SELECT c."authorId" FROM "Comments" c INNER JOIN "Ideas" i ON c."ideaId" = i.id WHERE c."createdAt" >= :start AND c."createdAt" <= :end AND i."organizationId" = :organizationId
        UNION
        SELECT v."userId" FROM "Votes" v INNER JOIN "Ideas" i ON v."ideaId" = i.id WHERE v."createdAt" >= :start AND v."createdAt" <= :end AND i."organizationId" = :organizationId
      ) t`,
      { replacements: { start, end, organizationId }, type: Idea.sequelize.QueryTypes.SELECT }
    ),
    Idea.sequelize.query(
      `SELECT COUNT(DISTINCT user_id) as count FROM (
        SELECT "authorId" as user_id FROM "Ideas" WHERE "createdAt" >= :prevStart AND "createdAt" <= :prevEnd AND "organizationId" = :organizationId
        UNION
        SELECT c."authorId" FROM "Comments" c INNER JOIN "Ideas" i ON c."ideaId" = i.id WHERE c."createdAt" >= :prevStart AND c."createdAt" <= :prevEnd AND i."organizationId" = :organizationId
        UNION
        SELECT v."userId" FROM "Votes" v INNER JOIN "Ideas" i ON v."ideaId" = i.id WHERE v."createdAt" >= :prevStart AND v."createdAt" <= :prevEnd AND i."organizationId" = :organizationId
      ) t`,
      {
        replacements: { prevStart, prevEnd, organizationId },
        type: Idea.sequelize.QueryTypes.SELECT,
      }
    ),
  ]);
  const activeUsers = parseInt(activeResult[0].count);
  const prevActiveUsers = parseInt(prevActiveResult[0].count);
  const participationRate =
    totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100 * 10) / 10 : 0;

  // Avg time to implementation (all time, complete ideas)
  const resolvedIdeas = await Idea.findAll({
    attributes: ["createdAt", "updatedAt"],
    where: { organizationId, status: { [Op.in]: COMPLETE_STATUSES } },
    raw: true,
  });
  const avgTimeToImplementation =
    resolvedIdeas.length > 0
      ? Math.round(
          (resolvedIdeas.reduce(
            (sum, i) => sum + (new Date(i.updatedAt) - new Date(i.createdAt)) / 86400000,
            0
          ) /
            resolvedIdeas.length) *
            10
        ) / 10
      : 0;

  // --- ROI Impact ---
  const completedWithFreq = await Idea.findAll({
    where: {
      organizationId,
      status: { [Op.in]: COMPLETE_STATUSES },
      timeSavedMinutes: { [Op.ne]: null },
      frequencyCount: { [Op.ne]: null },
      frequencyPeriod: { [Op.ne]: null },
    },
    attributes: ["timeSavedMinutes", "frequencyCount", "frequencyPeriod"],
    raw: true,
  });
  const annualSavings = calculateAggregateSavings(completedWithFreq);
  const annualCostSavings = Math.round(annualSavings.hours * rate);
  const costPerIdea =
    resolvedIdeas.length > 0 ? Math.round(annualCostSavings / resolvedIdeas.length) : 0;

  // --- Top 5 unimplemented ideas (by votes, excluding complete/rejected) ---
  const excludedStatuses = [
    ...COMPLETE_STATUSES,
    "Rejected",
    "Closed - Rejected",
    "Duplicate",
    "Hidden",
  ];
  const topIdeas = await Idea.sequelize.query(
    `SELECT
      i.id, i.slug, i.title, i.status, i.category,
      i."timeSavedMinutes", i."impactScore",
      COUNT(v.id)::int as "voteCount",
      u.username as champion
    FROM "Ideas" i
    LEFT JOIN "Votes" v ON i.id = v."ideaId"
    LEFT JOIN "Users" u ON i."authorId" = u.id
    WHERE i."organizationId" = :organizationId
      AND i.status NOT IN (:excludedStatuses)
      AND i."isPrivate" = false
    GROUP BY i.id, i.slug, i.title, i.status, i.category, i."timeSavedMinutes", i."impactScore", u.username
    ORDER BY COUNT(v.id) DESC, i."impactScore" DESC NULLS LAST
    LIMIT 5`,
    { replacements: { organizationId, excludedStatuses }, type: Idea.sequelize.QueryTypes.SELECT }
  );

  // --- Pipeline status ---
  // #951 (review follow-up): ONE unscoped grouped query bucketed through the
  // shared canonical vocabulary, instead of an Op.in-scoped query that could
  // not see out-of-vocabulary ideas (including NULL statuses, which Op.notIn
  // also never matches). Whatever falls outside the vocabulary lands in
  // pipeline.unclassified, which the report renders as a warning, so the
  // executive artefact can no longer assert a count its own list contradicts.
  const pipelineRaw = await Idea.findAll({
    attributes: ["status", [Idea.sequelize.fn("COUNT", Idea.sequelize.col("id")), "count"]],
    where: { organizationId },
    group: ["status"],
    raw: true,
  });
  const { counts: statusBuckets, unmapped: unmappedStatuses } = bucketStatusCounts(pipelineRaw);
  if (unmappedStatuses.length > 0) {
    logger.warn("[BoardReport] Ideas excluded from pipeline by unknown status", {
      organizationId,
      unmappedStatuses,
      unclassifiedCount: statusBuckets["Other"] || 0,
    });
  }
  const pipeline = {
    reviewing: statusBuckets["Reviewing"] || 0,
    approved: statusBuckets["Approved"] || 0,
    inProgress: statusBuckets["In Progress"] || 0,
    implemented: statusBuckets["Complete"] || 0,
    unclassified: statusBuckets["Other"] || 0,
  };

  // Stuck ideas: in Reviewing >14 days
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const stuckCount = await Idea.count({
    where: {
      organizationId,
      status: { [Op.in]: ["Reviewing", "Under Review"] },
      updatedAt: { [Op.lt]: fourteenDaysAgo },
    },
  });

  // --- Next quarter recommendations: top 3 by (votes * impactScore) ---
  const recommendations = await Idea.sequelize.query(
    `SELECT
      i.id, i.slug, i.title, i.status, i.category,
      i."timeSavedMinutes", i."impactScore", i."effortScore",
      COUNT(v.id)::int as "voteCount"
    FROM "Ideas" i
    LEFT JOIN "Votes" v ON i.id = v."ideaId"
    WHERE i."organizationId" = :organizationId
      AND i.status NOT IN (:excludedStatuses)
      AND i."isPrivate" = false
    GROUP BY i.id, i.slug, i.title, i.status, i.category, i."timeSavedMinutes", i."impactScore", i."effortScore"
    ORDER BY (COUNT(v.id) * COALESCE(i."impactScore", 5)) DESC
    LIMIT 3`,
    { replacements: { organizationId, excludedStatuses }, type: Idea.sequelize.QueryTypes.SELECT }
  );

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      period,
      start: start.toISOString(),
      end: end.toISOString(),
      hourlyRate: rate,
      organization: {
        name: org.organizationName,
        logoUrl: org.logoUrl,
        primaryColor: org.primaryColor,
      },
    },
    executiveSummary: {
      totalIdeas: computeTrend(totalIdeasCurrent, totalIdeasPrev),
      implemented: computeTrend(implementedCurrent, implementedPrev),
      participationRate,
      activeUsers: computeTrend(activeUsers, prevActiveUsers),
      totalUsers,
      avgTimeToImplementation,
    },
    roiImpact: {
      annualTimeSavedHours: annualSavings.hours,
      annualCostSavings,
      costPerIdea,
      ideasImplemented: resolvedIdeas.length,
    },
    topIdeas,
    pipeline,
    stuckCount,
    recommendations,
  };
}
