import express from "express";
import { requireAdmin, requireSameOrganization } from "../middleware/auth.js";
import Comment from "../models/Comment.js";
import CommentVote from "../models/CommentVote.js";
import Idea from "../models/Idea.js";
import User from "../models/User.js";
import Organization from "../models/Organization.js";
import { isValidUUID } from "../utils/validation.js";
import { validateProfanity } from "../middleware/profanityFilter.js";
import { sendCommentOnIdeaEmail } from "../services/notificationEmailService.js";
import { formatServerError } from "../utils/formatServerError.js";
import { createLogger } from "../utils/logger.js";

const router = express.Router();

// Get comments for an idea (regular comments only)
router.get("/idea/:ideaId", requireSameOrganization, async (req, res) => {
  try {
    if (!isValidUUID(req.params.ideaId)) {
      return res.status(404).json({ error: "Idea not found" });
    }
    const comments = await Comment.findAll({
      where: {
        ideaId: req.params.ideaId,
        organizationId: req.user.organizationId, // #493 application-guard alongside RLS tenant_id
        isAdminOnly: false, // Only return regular comments
      },
      include: [
        {
          model: User,
          as: "author",
          attributes: ["id", "username", "isAnonymous", "isAdmin", "isSuperuser"],
        },
        { model: CommentVote, as: "votes", required: false },
      ],
      order: [["createdAt", "ASC"]],
    });

    // Find user's votes on these comments
    const commentIds = comments.map((c) => c.id);
    const userVotes = await CommentVote.findAll({
      where: {
        commentId: commentIds,
        userId: req.user.id,
        organizationId: req.user.organizationId, // #734 application-guard alongside RLS tenant_id
        tenant_id: req.user.tenant_id,
      },
    });

    const userVoteMap = {};
    userVotes.forEach((vote) => {
      userVoteMap[vote.commentId] = true;
    });

    // Add userVoted field to each comment
    const commentsWithVoteInfo = comments.map((c) => {
      const cJson = c.toJSON();
      cJson.userVoted = userVoteMap[c.id] || false;
      return cJson;
    });

    res.json(commentsWithVoteInfo);
  } catch (err) {
    res
      .status(500)
      .json(formatServerError(err, "Failed to fetch comments", "Error fetching comments:"));
  }
});

// Add comment to idea (regular comment)
router.post(
  "/idea/:ideaId",
  requireSameOrganization,
  validateProfanity(["content"]),
  async (req, res) => {
    const logger = createLogger(req);
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: "Content required" });
    try {
      const comment = await Comment.create({
        content,
        ideaId: req.params.ideaId,
        authorId: req.user.id,
        editHistory: [],
        isAdminOnly: false, // Regular comment
        organizationId: req.user.organizationId, // #493 application-guard alongside RLS tenant_id
        tenant_id: req.user.tenant_id,
      });
      // Automatically upvote the comment by the author
      await CommentVote.create({
        commentId: comment.id,
        userId: req.user.id,
        value: 1,
        organizationId: req.user.organizationId, // #734 application-guard alongside RLS tenant_id
        tenant_id: req.user.tenant_id,
      });

      // Send email notification to idea author (non-blocking)
      // Don't notify if commenter is the idea author
      const idea = await Idea.findByPk(req.params.ideaId, {
        include: [{ model: User, as: "author", attributes: ["id", "username", "email"] }],
      });

      if (idea && idea.author && idea.author.email && idea.authorId !== req.user.id) {
        const org = await Organization.findOne({
          where: { organizationId: req.user.organizationId },
        });
        const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";

        sendCommentOnIdeaEmail(idea.author.email, {
          userName: idea.author.username,
          ideaTitle: idea.title,
          ideaUrl: `${baseUrl}/org/${req.user.organizationId}/idea/${idea.slug || idea.id}`,
          commenterName: req.user.username,
          commentPreview: content,
          organizationId: req.user.organizationId,
          organization: org,
        }).catch((err) => {
          logger.error("Failed to send comment notification email:", { message: err.message });
        });
      }

      // Return comment with userVoted=true and votes array
      const commentWithVote = await Comment.findByPk(comment.id, {
        include: [
          {
            model: User,
            as: "author",
            attributes: ["id", "username", "isAnonymous", "isAdmin", "isSuperuser"],
          },
          { model: CommentVote, as: "votes", required: false },
        ],
      });
      const cJson = commentWithVote.toJSON();
      cJson.userVoted = true;
      res.status(201).json(cJson);
    } catch (err) {
      res.status(500).json(formatServerError(err, "Failed to add comment", "[Comments:add]"));
    }
  }
);

// Edit comment
router.put("/:id", requireSameOrganization, validateProfanity(["content"]), async (req, res) => {
  const logger = createLogger(req);
  try {
    if (!isValidUUID(req.params.id)) {
      return res.status(404).json({ error: "Comment not found" });
    }
    if (!req.user.tenant_id) {
      logger.warn("[Security] Rejecting comment edit: user has null tenant_id", {
        userId: req.user.id,
        username: req.user.username,
      });
      return res.status(403).json({
        error: "User account is missing tenant context. Please contact support.",
      });
    }
    const comment = await Comment.findOne({
      where: {
        id: req.params.id,
        organizationId: req.user.organizationId, // #493 application-guard alongside RLS tenant_id
        tenant_id: req.user.tenant_id,
      },
    });
    if (!comment) return res.status(404).json({ error: "Comment not found" });
    if (comment.authorId !== req.user.id && !req.user.isAdmin)
      return res.status(403).json({ error: "Not allowed" });
    // Save edit history
    const editHistory = comment.editHistory || [];
    editHistory.push({
      editedAt: new Date(),
      previous: { content: comment.content },
      editor: req.user.id,
    });
    comment.content = req.body.content || comment.content;
    comment.editHistory = editHistory;
    comment.isEdited = true;
    comment.editedAt = new Date();
    await comment.save();
    res.json(comment);
  } catch (err) {
    res.status(500).json(formatServerError(err, "Failed to edit comment", "[Comments:edit]"));
  }
});

// Delete comment
router.delete("/:id", requireSameOrganization, async (req, res) => {
  const logger = createLogger(req);
  try {
    if (!isValidUUID(req.params.id)) {
      return res.status(404).json({ error: "Comment not found" });
    }
    if (!req.user.tenant_id) {
      logger.warn("[Security] Rejecting comment delete: user has null tenant_id", {
        userId: req.user.id,
        username: req.user.username,
      });
      return res.status(403).json({
        error: "User account is missing tenant context. Please contact support.",
      });
    }
    const comment = await Comment.findOne({
      where: {
        id: req.params.id,
        organizationId: req.user.organizationId, // #493 application-guard alongside RLS tenant_id
        tenant_id: req.user.tenant_id,
      },
    });
    if (!comment) return res.status(404).json({ error: "Comment not found" });
    if (comment.authorId !== req.user.id && !req.user.isAdmin)
      return res.status(403).json({ error: "Not allowed" });
    await comment.destroy();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json(formatServerError(err, "Failed to delete comment", "[Comments:delete]"));
  }
});

// Upvote a comment
router.post("/:id/upvote", requireSameOrganization, async (req, res) => {
  const logger = createLogger(req);
  try {
    if (!req.user.tenant_id) {
      logger.warn("[Security] Rejecting comment upvote: user has null tenant_id", {
        userId: req.user.id,
        username: req.user.username,
      });
      return res.status(403).json({
        error: "User account is missing tenant context. Please contact support.",
      });
    }
    // Check if comment exists in caller's tenant
    const comment = await Comment.findOne({
      where: {
        id: req.params.id,
        organizationId: req.user.organizationId, // #493 application-guard alongside RLS tenant_id
        tenant_id: req.user.tenant_id,
      },
    });
    if (!comment) return res.status(404).json({ error: "Comment not found" });

    // Check if user already voted
    let vote = await CommentVote.findOne({
      where: {
        commentId: req.params.id,
        userId: req.user.id,
        organizationId: req.user.organizationId, // #734 application-guard alongside RLS tenant_id
        tenant_id: req.user.tenant_id,
      },
    });

    if (vote) {
      // User already voted
      return res.status(400).json({ error: "Already voted on this comment" });
    }

    // Create new vote
    vote = await CommentVote.create({
      commentId: req.params.id,
      userId: req.user.id,
      value: 1,
      organizationId: req.user.organizationId, // #734 application-guard alongside RLS tenant_id
      tenant_id: req.user.tenant_id,
    });

    res.status(201).json({ success: true });
  } catch (err) {
    res
      .status(500)
      .json(formatServerError(err, "Failed to upvote comment", "Error upvoting comment:"));
  }
});

// Remove upvote from a comment
router.delete("/:id/upvote", requireSameOrganization, async (req, res) => {
  const logger = createLogger(req);
  try {
    if (!isValidUUID(req.params.id)) {
      return res.status(404).json({ error: "Comment not found" });
    }
    if (!req.user.tenant_id) {
      logger.warn("[Security] Rejecting comment upvote removal: user has null tenant_id", {
        userId: req.user.id,
        username: req.user.username,
      });
      return res.status(403).json({
        error: "User account is missing tenant context. Please contact support.",
      });
    }
    // #734: parent-comment guard. Confirm the comment exists in the caller's
    // tenant before touching the vote, so a smuggled commentId cannot be used
    // to delete a same-userId vote that lives in another tenant. Pre-fix this
    // route had no application-guard at all, so any logged-in user could
    // delete any vote whose commentId they could enumerate.
    const comment = await Comment.findOne({
      where: {
        id: req.params.id,
        organizationId: req.user.organizationId,
        tenant_id: req.user.tenant_id,
      },
    });
    if (!comment) return res.status(404).json({ error: "Comment not found" });

    const vote = await CommentVote.findOne({
      where: {
        commentId: req.params.id,
        userId: req.user.id,
        organizationId: req.user.organizationId, // #734 application-guard alongside RLS tenant_id
        tenant_id: req.user.tenant_id,
      },
    });

    if (!vote) {
      return res.status(404).json({ error: "Vote not found" });
    }

    await vote.destroy();
    res.json({ success: true });
  } catch (err) {
    res
      .status(500)
      .json(formatServerError(err, "Failed to remove upvote", "Error removing comment upvote:"));
  }
});

// Get admin-only comments for an idea (admin only)
router.get("/admin/idea/:ideaId", requireSameOrganization, requireAdmin, async (req, res) => {
  try {
    if (!isValidUUID(req.params.ideaId)) {
      return res.status(404).json({ error: "Idea not found" });
    }
    const comments = await Comment.findAll({
      where: {
        ideaId: req.params.ideaId,
        organizationId: req.user.organizationId, // #493 application-guard alongside RLS tenant_id
        isAdminOnly: true, // Only return admin-only comments
      },
      include: [
        {
          model: User,
          as: "author",
          attributes: ["id", "username", "isAnonymous", "isAdmin", "isSuperuser"],
        },
        { model: CommentVote, as: "votes", required: false },
      ],
      order: [["createdAt", "ASC"]],
    });

    // Find user's votes on these comments
    const commentIds = comments.map((c) => c.id);
    const userVotes = await CommentVote.findAll({
      where: {
        commentId: commentIds,
        userId: req.user.id,
        organizationId: req.user.organizationId, // #734 application-guard alongside RLS tenant_id
        tenant_id: req.user.tenant_id,
      },
    });

    const userVoteMap = {};
    userVotes.forEach((vote) => {
      userVoteMap[vote.commentId] = true;
    });

    // Add userVoted field to each comment
    const commentsWithVoteInfo = comments.map((c) => {
      const cJson = c.toJSON();
      cJson.userVoted = userVoteMap[c.id] || false;
      return cJson;
    });

    res.json(commentsWithVoteInfo);
  } catch (err) {
    res
      .status(500)
      .json(
        formatServerError(err, "Failed to fetch admin comments", "Error fetching admin comments:")
      );
  }
});

// Add admin-only comment to idea (admin only)
router.post(
  "/admin/idea/:ideaId",
  requireSameOrganization,
  requireAdmin,
  validateProfanity(["content"]),
  async (req, res) => {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: "Content required" });
    try {
      const comment = await Comment.create({
        content,
        ideaId: req.params.ideaId,
        authorId: req.user.id,
        editHistory: [],
        isAdminOnly: true, // Admin-only comment
        organizationId: req.user.organizationId, // #493 application-guard alongside RLS tenant_id
        tenant_id: req.user.tenant_id,
      });
      // Automatically upvote the comment by the author
      await CommentVote.create({
        commentId: comment.id,
        userId: req.user.id,
        value: 1,
        organizationId: req.user.organizationId, // #734 application-guard alongside RLS tenant_id
        tenant_id: req.user.tenant_id,
      });
      // Return comment with userVoted=true and votes array
      const commentWithVote = await Comment.findByPk(comment.id, {
        include: [
          {
            model: User,
            as: "author",
            attributes: ["id", "username", "isAnonymous", "isAdmin", "isSuperuser"],
          },
          { model: CommentVote, as: "votes", required: false },
        ],
      });
      const cJson = commentWithVote.toJSON();
      cJson.userVoted = true;
      res.status(201).json(cJson);
    } catch (err) {
      res
        .status(500)
        .json(formatServerError(err, "Failed to add admin comment", "[Comments:admin-add]"));
    }
  }
);

export default router;
