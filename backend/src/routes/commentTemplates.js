import express from "express";
import { requireAdmin } from "../middleware/auth.js";
import CommentTemplate from "../models/CommentTemplate.js";
import { formatServerError } from "../utils/formatServerError.js";
import { createLogger } from "../utils/logger.js";

const router = express.Router();

// List templates for the user's organisation (all authenticated users)
router.get("/", async (req, res) => {
  try {
    const templates = await CommentTemplate.findAll({
      where: {
        organizationId: req.user.organizationId,
        tenant_id: req.user.tenant_id,
      },
      attributes: ["id", "title", "content", "createdAt"],
      order: [["title", "ASC"]],
    });
    res.json(templates);
  } catch (err) {
    res
      .status(500)
      .json(formatServerError(err, "Failed to fetch templates", "[CommentTemplates:list]"));
  }
});

// Create template (admin only)
router.post("/", requireAdmin, async (req, res) => {
  const log = createLogger(req);
  const { title, content } = req.body;
  if (!title?.trim() || !content?.trim()) {
    return res.status(400).json({ error: "title and content are required" });
  }
  try {
    const template = await CommentTemplate.create({
      title: title.trim(),
      content: content.trim(),
      organizationId: req.user.organizationId,
      tenant_id: req.user.tenant_id,
    });
    log.info(
      `[CommentTemplates] Created template "${template.title}" for ${req.user.organizationId}`
    );
    res.status(201).json(template);
  } catch (err) {
    res
      .status(500)
      .json(formatServerError(err, "Failed to create template", "[CommentTemplates:create]"));
  }
});

// Update template (admin only)
router.put("/:id", requireAdmin, async (req, res) => {
  const log = createLogger(req);
  const { title, content } = req.body;
  if (!title?.trim() || !content?.trim()) {
    return res.status(400).json({ error: "title and content are required" });
  }
  try {
    const template = await CommentTemplate.findOne({
      where: {
        id: req.params.id,
        organizationId: req.user.organizationId,
        tenant_id: req.user.tenant_id,
      },
    });
    if (!template) return res.status(404).json({ error: "Template not found" });

    await template.update({ title: title.trim(), content: content.trim() });
    log.info(`[CommentTemplates] Updated template ${req.params.id} for ${req.user.organizationId}`);
    res.json(template);
  } catch (err) {
    res
      .status(500)
      .json(formatServerError(err, "Failed to update template", "[CommentTemplates:update]"));
  }
});

// Delete template (admin only)
router.delete("/:id", requireAdmin, async (req, res) => {
  const log = createLogger(req);
  try {
    const template = await CommentTemplate.findOne({
      where: {
        id: req.params.id,
        organizationId: req.user.organizationId,
        tenant_id: req.user.tenant_id,
      },
    });
    if (!template) return res.status(404).json({ error: "Template not found" });

    await template.destroy();
    log.info(`[CommentTemplates] Deleted template ${req.params.id} for ${req.user.organizationId}`);
    res.json({ success: true });
  } catch (err) {
    res
      .status(500)
      .json(formatServerError(err, "Failed to delete template", "[CommentTemplates:delete]"));
  }
});

export default router;
