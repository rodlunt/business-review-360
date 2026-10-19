/**
 * IdeaService: HTTP-agnostic business logic for ideas.
 *
 * Issue #485, Phase 2. Design spec:
 *   docs/superpowers/specs/2026-04-29-485-domain-service-layer-design.md
 *
 * All exports are plain async functions. No Express types. Inputs are a `ctx`
 * object plus typed payload; outputs are plain data or a thrown ServiceError.
 *
 * ctx shape: { user, organizationId, tx }
 *   - user: { id, username, isAdmin, isAnonymous, organizationId, tenant_id }
 *   - organizationId: string (hoisted from user for ergonomics)
 *   - tx: Sequelize transaction or null (threaded to raw queries; CLS handles models)
 */

import { Op, literal } from "sequelize";
import Idea from "../models/Idea.js";
import User from "../models/User.js";
import Vote from "../models/Vote.js";
import Comment from "../models/Comment.js";
import Category from "../models/Category.js";
import Organization from "../models/Organization.js";
import { isValidUUID } from "../utils/validation.js";
import {
  sendStatusChangeEmail,
  sendIdeaImplementedEmail,
  sendNewIdeaSubmittedEmail,
} from "./notificationEmailService.js";
import { logger } from "../utils/logger.js";
import { ValidationError, NotFoundError, ForbiddenError } from "./errors.js";
import { PRIORITY_THRESHOLD } from "../constants/priorityMatrix.js";

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;

const QUADRANT_CONDITIONS = {
  "quick-wins": {
    impactScore: { [Op.gt]: PRIORITY_THRESHOLD },
    effortScore: { [Op.lte]: PRIORITY_THRESHOLD },
  },
  strategic: {
    impactScore: { [Op.gt]: PRIORITY_THRESHOLD },
    effortScore: { [Op.gt]: PRIORITY_THRESHOLD },
  },
  "thankless-tasks": {
    impactScore: { [Op.lte]: PRIORITY_THRESHOLD },
    effortScore: { [Op.gt]: PRIORITY_THRESHOLD },
  },
  "fill-ins": {
    [Op.and]: [
      { [Op.or]: [{ impactScore: null }, { impactScore: { [Op.lte]: PRIORITY_THRESHOLD } }] },
      { [Op.or]: [{ effortScore: null }, { effortScore: { [Op.lte]: PRIORITY_THRESHOLD } }] },
    ],
  },
};
const DEFAULT_PAGE = 1;
const MIN_LIMIT = 1;
const DEFAULT_SORT = "newest";
const VALID_SORTS = new Set(["trending", "popular", "newest", "oldest"]);

export const BATCH_ACTIONS = new Set(["setStatus", "setPinned", "setCategory", "setPriority"]);
const VALID_STATUSES = new Set([
  "Reviewing",
  "In Progress",
  "Approved",
  "Complete",
  "Rejected",
  "Duplicate",
  "Hidden",
  "Open",
]);
export const BATCH_MAX_IDS = 100;

/**
 * Parse and validate pagination + sort query parameters.
 *
 * Throws ValidationError for unknown sort values. All other inputs are coerced.
 * Returns { page, limit, sort, clamped } where `clamped` signals that limit was
 * silently reduced to MAX_LIMIT so the route can set X-RateLimit-Clamp.
 *
 * @param {object} query Raw req.query object
 * @returns {{ page: number, limit: number, sort: string, clamped: boolean }}
 */
export function parsePaginationParams(query) {
  const rawPage = query.page;
  const rawLimit = query.limit;
  const rawSort = query.sort;

  let page = parseInt(rawPage, 10);
  if (!Number.isFinite(page) || page < 1) page = DEFAULT_PAGE;

  let limit;
  let clamped = false;
  if (rawLimit === undefined || rawLimit === null || rawLimit === "") {
    limit = DEFAULT_LIMIT;
  } else {
    const parsed = parseInt(rawLimit, 10);
    if (!Number.isFinite(parsed)) {
      limit = DEFAULT_LIMIT;
    } else if (parsed > MAX_LIMIT) {
      limit = MAX_LIMIT;
      clamped = true;
    } else if (parsed < MIN_LIMIT) {
      limit = MIN_LIMIT;
    } else {
      limit = parsed;
    }
  }

  let sort = DEFAULT_SORT;
  if (rawSort !== undefined && rawSort !== null && rawSort !== "") {
    if (!VALID_SORTS.has(rawSort)) {
      throw new ValidationError(
        `Invalid sort parameter. Must be one of: ${[...VALID_SORTS].join(", ")}.`,
        { code: "INVALID_SORT", details: { sort: rawSort } }
      );
    }
    sort = rawSort;
  }

  return { page, limit, sort, clamped };
}

function buildBatchUpdate(action, payload) {
  switch (action) {
    case "setStatus": {
      const status = payload?.status;
      if (typeof status !== "string" || !VALID_STATUSES.has(status)) {
        throw new ValidationError(
          `Invalid status. Must be one of: ${[...VALID_STATUSES].join(", ")}.`,
          { code: "INVALID_BATCH_PAYLOAD", details: { field: "status" } }
        );
      }
      return { status };
    }
    case "setPinned": {
      if (typeof payload?.isPinned !== "boolean") {
        throw new ValidationError("isPinned must be a boolean.", {
          code: "INVALID_BATCH_PAYLOAD",
          details: { field: "isPinned" },
        });
      }
      return { isPinned: payload.isPinned };
    }
    case "setCategory": {
      const c = payload?.category;
      if (c !== null && typeof c !== "string") {
        throw new ValidationError("category must be a string or null.", {
          code: "INVALID_BATCH_PAYLOAD",
          details: { field: "category" },
        });
      }
      return { category: c };
    }
    case "setPriority": {
      const p = payload?.priority;
      if (p !== null && !Number.isInteger(p)) {
        throw new ValidationError("priority must be an integer or null.", {
          code: "INVALID_BATCH_PAYLOAD",
          details: { field: "priority" },
        });
      }
      return { priority: p };
    }
    default:
      throw new ValidationError(
        `Unsupported action. Must be one of: ${[...BATCH_ACTIONS].join(", ")}.`,
        { code: "INVALID_BATCH_ACTION", details: { action } }
      );
  }
}

/**
 * List ideas for an organisation with pagination, filtering, and sorting.
 *
 * @param {{ organizationId: string, user: { id: string, isAdmin: boolean } }} ctx
 * @param {object} queryParams Raw query string params (page, limit, sort, category, status, search)
 * @returns {{ ideas: object[], pagination: object, clamped: boolean }}
 */
export async function listIdeas(ctx, queryParams) {
  const { organizationId, user } = ctx;

  if (!organizationId) {
    throw new ForbiddenError(
      "User account is missing organisation information. Please contact support."
    );
  }

  const { page, limit, sort, clamped } = parsePaginationParams(queryParams);
  const { category, status, search, quadrant } = queryParams;
  const VALID_QUADRANTS = new Set(["quick-wins", "strategic", "thankless-tasks", "fill-ins"]);
  if (quadrant && !VALID_QUADRANTS.has(quadrant)) {
    throw new ValidationError(
      `Invalid quadrant: ${quadrant}. Must be one of: ${[...VALID_QUADRANTS].join(", ")}`
    );
  }
  const offset = (page - 1) * limit;

  const where = { organizationId };

  if (!user.isAdmin) {
    where[Op.or] = [{ isPrivate: false }, { isPrivate: true, authorId: user.id }];
    where.status = { [Op.ne]: "Closed - Hidden" };
  }

  if (category) where.category = category;
  if (status) where.status = status;

  if (search) {
    const searchCondition = [
      { title: { [Op.iLike]: `%${search}%` } },
      { description: { [Op.iLike]: `%${search}%` } },
    ];
    if (where[Op.or]) {
      where[Op.and] = [{ [Op.or]: where[Op.or] }, { [Op.or]: searchCondition }];
      delete where[Op.or];
    } else {
      where[Op.or] = searchCondition;
    }
  }

  const qc = quadrant ? QUADRANT_CONDITIONS[quadrant] : null;
  if (qc) {
    if (where[Op.and]) {
      where[Op.and].push(qc);
    } else if (where[Op.or]) {
      where[Op.and] = [{ [Op.or]: where[Op.or] }, qc];
      delete where[Op.or];
    } else {
      where[Op.and] = [qc];
    }
  }

  const SEVEN_DAYS_AGO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const FOURTEEN_DAYS_AGO = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  let order = [["isPinned", "DESC"]];

  if (sort === "newest") {
    order.push(["createdAt", "DESC"]);
  } else if (sort === "oldest") {
    order.push(["createdAt", "ASC"]);
  } else if (sort === "popular") {
    order.push([
      literal(
        `(SELECT COUNT(*) FROM "Votes" WHERE "Votes"."ideaId" = "Idea"."id" AND "Votes"."createdAt" >= '${SEVEN_DAYS_AGO}')`
      ),
      "DESC",
    ]);
    order.push(["createdAt", "DESC"]);
  } else if (sort === "trending") {
    order.push([
      literal(
        `(
          (SELECT COUNT(*) FROM "Votes" WHERE "Votes"."ideaId" = "Idea"."id" AND "Votes"."createdAt" >= '${SEVEN_DAYS_AGO}')
          + 2 * (SELECT COUNT(*) FROM "Comments" WHERE "Comments"."ideaId" = "Idea"."id" AND "Comments"."isAdminOnly" = false AND "Comments"."createdAt" >= '${SEVEN_DAYS_AGO}')
          + (CASE WHEN "Idea"."createdAt" >= '${FOURTEEN_DAYS_AGO}' THEN 2 ELSE 0 END)
        )`
      ),
      "DESC",
    ]);
    order.push(["createdAt", "DESC"]);
  }

  const { count, rows: ideas } = await Idea.findAndCountAll({
    where,
    attributes: [
      "id",
      "title",
      "description",
      "category",
      "status",
      "priority",
      "isPinned",
      "isPrivate",
      "slug",
      "createdAt",
      "updatedAt",
      "authorId",
      "wouldSpendOwnMoney",
      "orgImpact",
      "fixImpact",
      "solution",
      "additionalComments",
      "impactScore",
      "effortScore",
    ],
    include: [
      { model: User, as: "author", attributes: ["id", "username", "isAnonymous"] },
      { model: Vote, as: "votes", required: false },
    ],
    order,
    limit,
    offset,
    distinct: true,
  });

  const ideaIds = ideas.map((idea) => idea.id);
  const comments =
    ideaIds.length > 0
      ? await Comment.findAll({
          where: { ideaId: ideaIds, isAdminOnly: false },
          attributes: ["id", "ideaId", "createdAt"],
        })
      : [];

  const commentsByIdea = {};
  comments.forEach((comment) => {
    if (!commentsByIdea[comment.ideaId]) commentsByIdea[comment.ideaId] = [];
    commentsByIdea[comment.ideaId].push(comment);
  });

  const now = new Date();
  const ONE_DAY = 24 * 60 * 60 * 1000;

  const enrichedIdeas = ideas.map((idea) => {
    const ideaData = idea.toJSON();
    ideaData.comments = commentsByIdea[idea.id] || [];

    let trendingScore = 0;
    (ideaData.votes || []).forEach((vote) => {
      const daysSinceVote = (now - new Date(vote.createdAt)) / ONE_DAY;
      if (daysSinceVote <= 7) trendingScore += Math.max(0, (7 - daysSinceVote) / 7);
    });
    (ideaData.comments || []).forEach((comment) => {
      const daysSinceComment = (now - new Date(comment.createdAt)) / ONE_DAY;
      if (daysSinceComment <= 7) trendingScore += 2 * Math.max(0, (7 - daysSinceComment) / 7);
    });
    const ideaAgeDays = (now - new Date(idea.createdAt)) / ONE_DAY;
    if (ideaAgeDays <= 14) trendingScore += Math.max(0, (14 - ideaAgeDays) / 14) * 2;
    ideaData.trendingScore = parseFloat(trendingScore.toFixed(2));

    return ideaData;
  });

  const totalPages = limit > 0 ? Math.ceil(count / limit) : 0;
  return {
    ideas: enrichedIdeas,
    pagination: { page, limit, totalItems: count, totalPages, hasMore: page < totalPages },
    clamped,
  };
}

/**
 * Fetch a single idea by slug or UUID, applying visibility rules.
 *
 * @param {{ organizationId: string, user: { id: string, isAdmin: boolean } }} ctx
 * @param {string} identifier Slug or UUID
 * @returns {object} idea JSON with isAdminAuthor and authorName fields added
 * @throws {NotFoundError} if not found or hidden from this user
 * @throws {ForbiddenError} if private and user is not author or admin
 */
export async function getIdeaByIdentifier(ctx, identifier) {
  const { organizationId, user } = ctx;
  const include = [
    { model: User, as: "author", attributes: ["id", "username", "isAdmin", "isSuperuser"] },
    { model: Vote, as: "votes", required: false },
    { model: Comment, as: "ideaComments", required: false },
  ];

  let idea = await Idea.findOne({ where: { slug: identifier, organizationId }, include });

  if (!idea && isValidUUID(identifier)) {
    idea = await Idea.findOne({ where: { id: identifier, organizationId }, include });
  }

  if (!idea) throw new NotFoundError("Idea not found", { code: "IDEA_NOT_FOUND" });

  if (idea.isPrivate && !user.isAdmin && idea.authorId !== user.id) {
    throw new ForbiddenError("Access denied", { code: "IDEA_ACCESS_DENIED" });
  }

  if (idea.status === "Closed - Hidden" && !user.isAdmin) {
    throw new NotFoundError("Idea not found", { code: "IDEA_NOT_FOUND" });
  }

  const ideaData = idea.toJSON();
  ideaData.isAdminAuthor = ideaData.author?.isAdmin || false;
  ideaData.isSuperuserAuthor = ideaData.author?.isSuperuser || false;
  ideaData.authorName = ideaData.author?.username || "Anonymous";
  return ideaData;
}

/**
 * Create a new idea. Auto-creates the category if needed. Sends new-idea
 * notification emails to admins (non-blocking, non-private ideas only).
 *
 * @param {{ organizationId: string, user: object }} ctx
 * @param {object} payload
 * @returns {object} created Idea instance
 */
export async function createIdea(ctx, payload) {
  const { organizationId, user } = ctx;

  if (!organizationId) {
    throw new ForbiddenError(
      "User account is missing organisation information. Please contact support."
    );
  }

  const {
    title,
    description,
    category,
    wouldSpendOwnMoney,
    additionalComments,
    orgImpact,
    fixImpact,
    solution,
    isPrivate,
    timeSavedMinutes,
    frequencyCount,
    frequencyPeriod,
    impactScore,
    effortScore,
  } = payload;

  if (!title || !description) {
    throw new ValidationError("Title and description required", {
      code: "IDEA_MISSING_FIELDS",
    });
  }

  if (category && category.trim()) {
    const [, created] = await Category.findOrCreate({
      where: { name: category.trim(), organizationId },
      defaults: {
        name: category.trim(),
        createdBy: user.id,
        organizationId,
        tenant_id: user.tenant_id,
      },
    });
    if (created) {
      logger.info(
        `[IdeaService] Auto-created category: ${category.trim()} for organisation ${organizationId}`
      );
    }
  }

  const idea = await Idea.create({
    title,
    description,
    category,
    wouldSpendOwnMoney: wouldSpendOwnMoney || false,
    additionalComments,
    orgImpact,
    fixImpact,
    solution,
    isPrivate: isPrivate || false,
    timeSavedMinutes: timeSavedMinutes || null,
    frequencyCount: frequencyCount || null,
    frequencyPeriod: frequencyPeriod || null,
    impactScore: impactScore || 5,
    effortScore: effortScore || 5,
    authorId: user.id,
    organizationId,
    tenant_id: user.tenant_id,
  });

  if (!isPrivate) {
    const org = await Organization.findOne({ where: { organizationId } });
    const admins = await User.findAll({
      where: { organizationId, isAdmin: true, isApproved: true },
      attributes: ["id", "username", "email"],
    });
    const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const ideaUrl = `${baseUrl}/org/${organizationId}/idea/${idea.slug || idea.id}`;

    for (const admin of admins) {
      if (admin.id !== user.id && admin.email) {
        sendNewIdeaSubmittedEmail(admin.email, {
          adminUserId: admin.id,
          adminName: admin.username,
          ideaTitle: title,
          ideaDescription: description,
          ideaUrl,
          authorName: user.username,
          category: category || null,
          priority: null,
          timeSavedMinutes: timeSavedMinutes || null,
          impactScore: impactScore || null,
          effortScore: effortScore || null,
          organizationId,
          organization: org,
        }).catch((err) => {
          logger.error(`[IdeaService] Failed to send new-idea notification to ${admin.email}:`, {
            message: err.message,
          });
        });
      }
    }
  }

  return idea;
}

/**
 * Update an idea's content (user or admin).
 * Auto-creates the category if it changed and doesn't exist.
 *
 * @param {{ organizationId: string, user: { id: string, isAdmin: boolean, tenant_id: string } }} ctx
 * @param {string} id UUID
 * @param {object} payload
 * @returns {object} updated Idea instance
 */
export async function updateIdea(ctx, id, payload) {
  const { organizationId, user } = ctx;

  if (!isValidUUID(id)) throw new NotFoundError("Idea not found", { code: "IDEA_NOT_FOUND" });

  const idea = await Idea.findOne({ where: { id, organizationId } });
  if (!idea) throw new NotFoundError("Idea not found", { code: "IDEA_NOT_FOUND" });
  if (idea.authorId !== user.id && !user.isAdmin) {
    throw new ForbiddenError("Not allowed", { code: "IDEA_EDIT_FORBIDDEN" });
  }

  if (payload.category && payload.category.trim() && payload.category !== idea.category) {
    const [, created] = await Category.findOrCreate({
      where: { name: payload.category.trim(), organizationId },
      defaults: {
        name: payload.category.trim(),
        createdBy: user.id,
        organizationId,
        tenant_id: user.tenant_id,
      },
    });
    if (created) {
      logger.info(
        `[IdeaService] Auto-created category: ${payload.category.trim()} for organisation ${organizationId}`
      );
    }
  }

  idea.title = payload.title || idea.title;
  idea.description = payload.description || idea.description;
  idea.category = payload.category || idea.category;
  idea.additionalComments = payload.additionalComments || idea.additionalComments;
  if ("wouldSpendOwnMoney" in payload) idea.wouldSpendOwnMoney = payload.wouldSpendOwnMoney;
  if ("impactScore" in payload) idea.impactScore = payload.impactScore;
  if ("effortScore" in payload) idea.effortScore = payload.effortScore;

  await idea.save();
  return idea;
}

/**
 * Delete an idea (user or admin).
 *
 * @param {{ user: { id: string, isAdmin: boolean } }} ctx
 * @param {string} id UUID
 * @returns {{ success: true }}
 */
export async function deleteIdea(ctx, id) {
  const { organizationId, user } = ctx;

  if (!isValidUUID(id)) throw new NotFoundError("Idea not found", { code: "IDEA_NOT_FOUND" });

  const idea = await Idea.findOne({ where: { id, organizationId } });
  if (!idea) throw new NotFoundError("Idea not found", { code: "IDEA_NOT_FOUND" });
  if (idea.authorId !== user.id && !user.isAdmin) {
    throw new ForbiddenError("Not allowed", { code: "IDEA_DELETE_FORBIDDEN" });
  }

  await idea.destroy();
  return { success: true };
}

/**
 * Admin patch: pin, set status/category/priority, scores, actual time saved.
 * Sends status-change notification email when status changes (non-blocking).
 *
 * @param {{ organizationId: string, user: { id: string, username: string } }} ctx
 * @param {string} id UUID
 * @param {object} payload
 * @returns {object} updated Idea instance
 */
export async function adminUpdateIdea(ctx, id, payload) {
  const { organizationId, user } = ctx;

  if (!isValidUUID(id)) throw new NotFoundError("Idea not found", { code: "IDEA_NOT_FOUND" });

  const idea = await Idea.findOne({
    where: { id, organizationId },
    include: [{ model: User, as: "author", attributes: ["id", "username", "email"] }],
  });
  if (!idea) throw new NotFoundError("Idea not found", { code: "IDEA_NOT_FOUND" });

  const oldStatus = idea.status;

  if ("isPinned" in payload) idea.isPinned = payload.isPinned;
  if ("status" in payload) idea.status = payload.status;
  if ("category" in payload) idea.category = payload.category;
  if ("priority" in payload) idea.priority = payload.priority;
  if ("actualTimeSavedMinutes" in payload)
    idea.actualTimeSavedMinutes = payload.actualTimeSavedMinutes;
  if ("actualFrequencyCount" in payload) idea.actualFrequencyCount = payload.actualFrequencyCount;
  if ("actualFrequencyPeriod" in payload)
    idea.actualFrequencyPeriod = payload.actualFrequencyPeriod;
  if ("impactScore" in payload) idea.impactScore = payload.impactScore;
  if ("effortScore" in payload) idea.effortScore = payload.effortScore;

  await idea.save();

  if ("status" in payload && oldStatus !== payload.status && idea.author?.email) {
    const org = await Organization.findOne({ where: { organizationId } });
    const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const ideaUrl = `${baseUrl}/org/${organizationId}/idea/${idea.slug || idea.id}`;

    if (payload.status.toLowerCase() === "implemented") {
      sendIdeaImplementedEmail(idea.author.email, {
        userName: idea.author.username,
        ideaTitle: idea.title,
        ideaUrl,
        timeSavedMinutes: idea.actualTimeSavedMinutes || idea.timeSavedMinutes,
        implementationDate: new Date().toISOString(),
        adminComments: payload.adminComment || null,
        organizationId,
        organization: org,
      }).catch((err) => {
        logger.error("[IdeaService] Failed to send idea-implemented email:", {
          message: err.message,
        });
      });
    } else {
      sendStatusChangeEmail(idea.author.email, {
        userName: idea.author.username,
        ideaTitle: idea.title,
        ideaUrl,
        oldStatus,
        newStatus: payload.status,
        adminName: user.username,
        adminComments: payload.adminComment || null,
        organizationId,
        organization: org,
      }).catch((err) => {
        logger.error("[IdeaService] Failed to send status-change email:", { message: err.message });
      });
    }
  }

  return idea;
}

/**
 * Admin batch update: apply one action to many ideas in a single transaction.
 * Cross-tenant isolation enforced via WHERE organizationId.
 *
 * @param {{ organizationId: string }} ctx
 * @param {{ ids: string[], action: string, payload: object }} params
 * @returns {{ updated: number, ids: string[], action: string, payload: object }}
 */
export async function batchUpdateIdeas(ctx, { ids, action, payload }) {
  const { organizationId } = ctx;

  if (!Array.isArray(ids) || ids.length === 0) {
    throw new ValidationError("ids must be a non-empty array.", { code: "INVALID_BATCH_IDS" });
  }
  if (ids.length > BATCH_MAX_IDS) {
    throw new ValidationError(`Cannot batch more than ${BATCH_MAX_IDS} ideas at a time.`, {
      code: "BATCH_TOO_LARGE",
      details: { maxIds: BATCH_MAX_IDS },
    });
  }
  if (!ids.every((id) => typeof id === "string" && isValidUUID(id))) {
    throw new ValidationError("All ids must be valid UUIDs.", { code: "INVALID_BATCH_IDS" });
  }
  if (typeof action !== "string" || !BATCH_ACTIONS.has(action)) {
    throw new ValidationError(
      `Unsupported action. Must be one of: ${[...BATCH_ACTIONS].join(", ")}.`,
      { code: "INVALID_BATCH_ACTION", details: { action } }
    );
  }

  const update = buildBatchUpdate(action, payload);

  const sequelize = Idea.sequelize;
  let result;

  await sequelize.transaction(async (transaction) => {
    const matched = await Idea.findAll({
      where: { id: { [Op.in]: ids }, organizationId },
      attributes: ["id"],
      transaction,
    });
    const matchedIds = matched.map((row) => row.id);

    if (matchedIds.length !== ids.length) {
      const missing = ids.filter((id) => !matchedIds.includes(id));
      throw new ValidationError(
        "One or more ids do not belong to your organisation or do not exist.",
        { code: "BATCH_IDS_NOT_FOUND", details: { missing } }
      );
    }

    const [updatedCount] = await Idea.update(update, {
      where: { id: { [Op.in]: matchedIds }, organizationId },
      transaction,
    });
    result = { updated: updatedCount, ids: matchedIds };
  });

  return { ...result, action, payload: payload || null };
}

/**
 * Count ideas in the org created after a given timestamp.
 * Used by the personal changelog feature (Issue #521).
 *
 * @param {{ organizationId: string }} ctx
 * @param {Date} since
 * @returns {Promise<number>}
 */
export async function getChangelogCount(ctx, since) {
  const { organizationId } = ctx;
  return Idea.count({
    where: {
      organizationId,
      createdAt: { [Op.gt]: since },
    },
  });
}
