import express from "express";
import { requireSuperuser } from "../middleware/auth.js";
import Idea from "../models/Idea.js";
import Comment from "../models/Comment.js";
import Vote from "../models/Vote.js";
import User from "../models/User.js";
import ExcelJS from "exceljs";
import { stringify } from "csv-stringify/sync";
import { logger } from "../utils/logger.js";

const router = express.Router();

// Export all ideas, comments, votes as Excel (admin only)
router.get("/excel", requireSuperuser, async (req, res) => {
  // SECURITY: Only export data from the admin's organization
  const organizationId = req.user.organizationId;

  if (!organizationId) {
    return res.status(403).json({ error: "User account is missing organization information" });
  }

  const workbook = new ExcelJS.Workbook();
  const ideaSheet = workbook.addWorksheet("Ideas");
  const commentSheet = workbook.addWorksheet("Comments");
  const voteSheet = workbook.addWorksheet("Votes");

  // Ideas
  ideaSheet.columns = [
    { header: "ID", key: "id" },
    { header: "Title", key: "title" },
    { header: "Description", key: "description" },
    { header: "Category", key: "category" },
    { header: "Status", key: "status" },
    { header: "Priority", key: "priority" },
    { header: "Pinned", key: "isPinned" },
    { header: "Author", key: "author" },
    { header: "Created", key: "createdAt" },
  ];
  const ideas = await Idea.findAll({
    where: { organizationId },
    include: [{ model: User, as: "author" }],
  });
  ideas.forEach((i) => {
    ideaSheet.addRow({ ...i.toJSON(), author: i.author?.username });
  });

  // Comments (only for ideas in this organization)
  commentSheet.columns = [
    { header: "ID", key: "id" },
    { header: "IdeaID", key: "ideaId" },
    { header: "Author", key: "author" },
    { header: "Content", key: "content" },
    { header: "Created", key: "createdAt" },
  ];
  const comments = await Comment.findAll({
    include: [
      { model: User, as: "author" },
      { model: Idea, as: "idea", where: { organizationId }, attributes: [] },
    ],
  });
  comments.forEach((c) => {
    commentSheet.addRow({ ...c.toJSON(), author: c.author?.username });
  });

  // Votes (only for ideas in this organization)
  voteSheet.columns = [
    { header: "ID", key: "id" },
    { header: "IdeaID", key: "ideaId" },
    { header: "User", key: "user" },
    { header: "Created", key: "createdAt" },
  ];
  const votes = await Vote.findAll({
    include: [
      { model: User, as: "user" },
      { model: Idea, as: "idea", where: { organizationId }, attributes: [] },
    ],
  });
  votes.forEach((v) => {
    voteSheet.addRow({ ...v.toJSON(), user: v.user?.username });
  });

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", 'attachment; filename="business_review_export.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
});

// Export ideas as CSV (admin only)
router.get("/csv", requireSuperuser, async (req, res) => {
  try {
    // SECURITY: Only export data from the admin's organization
    const organizationId = req.user.organizationId;

    if (!organizationId) {
      return res.status(403).json({ error: "User account is missing organization information" });
    }

    const ideas = await Idea.findAll({
      where: { organizationId },
      include: [
        { model: User, as: "author" },
        { association: "ideaComments", include: [{ model: User, as: "author" }] },
        { association: "votes", include: [{ model: User, as: "user" }] },
      ],
    });

    // Transform ideas to flatten structure
    const flattenedIdeas = ideas.map((idea) => {
      const ideaData = idea.toJSON();
      return {
        id: ideaData.id,
        title: ideaData.title,
        description: ideaData.description,
        category: ideaData.category,
        status: ideaData.status,
        authorName: ideaData.author?.username || "Unknown",
        votes: ideaData.votes?.length || 0,
        comments: ideaData.ideaComments?.length || 0,
        createdAt: ideaData.createdAt,
        updatedAt: ideaData.updatedAt,
      };
    });

    // Generate CSV
    const csv = stringify(flattenedIdeas, {
      header: true,
      columns: [
        "id",
        "title",
        "description",
        "category",
        "status",
        "authorName",
        "votes",
        "comments",
        "createdAt",
        "updatedAt",
        "orgImpact",
        "fixImpact",
        "solution",
        "additionalComments",
      ],
    });

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="business_review_ideas.csv"');
    res.send(csv);
  } catch (error) {
    logger.error("CSV export error:", error);
    res.status(500).send("Failed to export CSV");
  }
});

// Export ideas as JSON (admin only)
router.get("/json", requireSuperuser, async (req, res) => {
  try {
    // SECURITY: Only export data from the admin's organization
    const organizationId = req.user.organizationId;

    if (!organizationId) {
      return res.status(403).json({ error: "User account is missing organization information" });
    }

    const ideas = await Idea.findAll({
      where: { organizationId },
      include: [
        { model: User, as: "author" },
        { association: "ideaComments", include: [{ model: User, as: "author" }] },
        { association: "votes", include: [{ model: User, as: "user" }] },
      ],
    });

    // Transform ideas for JSON export
    const exportData = {
      exportDate: new Date().toISOString(),
      totalIdeas: ideas.length,
      ideas: ideas.map((idea) => {
        const ideaData = idea.toJSON();
        return {
          id: ideaData.id,
          title: ideaData.title,
          description: ideaData.description,
          category: ideaData.category,
          status: ideaData.status,
          isPinned: ideaData.isPinned,
          authorName: ideaData.author?.username || "Unknown",
          orgImpact: ideaData.orgImpact,
          fixImpact: ideaData.fixImpact,
          solution: ideaData.solution,
          additionalComments: ideaData.additionalComments,
          votes:
            ideaData.votes?.map((vote) => ({
              userId: vote.userId,
              username: vote.user?.username,
              createdAt: vote.createdAt,
            })) || [],
          comments:
            ideaData.ideaComments?.map((comment) => ({
              id: comment.id,
              content: comment.content,
              authorName: comment.author?.username,
              isAdminOnly: comment.isAdminOnly,
              createdAt: comment.createdAt,
            })) || [],
          createdAt: ideaData.createdAt,
          updatedAt: ideaData.updatedAt,
        };
      }),
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", 'attachment; filename="business_review_ideas.json"');
    res.json(exportData);
  } catch (error) {
    logger.error("JSON export error:", error);
    res.status(500).json({ error: "Failed to export JSON" });
  }
});

// Export for third-party ticket systems (admin only)
router.get("/tickets", requireSuperuser, async (req, res) => {
  try {
    // SECURITY: Only export data from the admin's organization
    const organizationId = req.user.organizationId;

    if (!organizationId) {
      return res.status(403).json({ error: "User account is missing organization information" });
    }

    const ideas = await Idea.findAll({
      where: { organizationId },
      include: [
        { model: User, as: "author" },
        { model: Comment, as: "ideaComments", include: [{ model: User, as: "author" }] },
      ],
    });

    // Format data for ticket system import
    const ticketData = ideas.map((idea) => {
      const ideaData = idea.toJSON();

      // Compile comments into a single text field
      let commentsText = "";
      if (ideaData.ideaComments && ideaData.ideaComments.length > 0) {
        commentsText = ideaData.ideaComments
          .map((comment) => `${comment.author?.username || "Anonymous"}: ${comment.content}`)
          .join("\n\n");
      }

      return {
        title: ideaData.title,
        description: ideaData.description,
        status: ideaData.status,
        reporter: ideaData.author?.username || "Unknown",
        priority: ideaData.priority || "medium",
        category: ideaData.category,
        impact: ideaData.orgImpact || "",
        solution: ideaData.solution || "",
        comments: commentsText,
        created: ideaData.createdAt,
      };
    });

    // Generate JSON for ticket system
    const jsonData = JSON.stringify(ticketData, null, 2);

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", 'attachment; filename="business_review_tickets.json"');
    res.send(jsonData);
  } catch (error) {
    logger.error("Ticket export error:", error);
    res.status(500).send("Failed to export ticket data");
  }
});

export default router;
