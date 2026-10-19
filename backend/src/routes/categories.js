import express from "express";
import { Op, col } from "sequelize";
import { requireAdmin } from "../middleware/auth.js";
import Category from "../models/Category.js";
import Idea from "../models/Idea.js";
import { logAuditEvent, redactForAudit } from "../middleware/auditLog.js";
import { logger } from "../utils/logger.js";

const router = express.Router();

// Get all categories
router.get("/", async (req, res) => {
  try {
    // SECURITY: Only show categories from user's organization
    const organizationId = req.user.organizationId;

    if (!organizationId) {
      return res.status(403).json({ error: "User account is missing organization information" });
    }

    logger.info("[Categories] Fetching categories for organization:", organizationId);

    const [tableCategories, ideaCategories] = await Promise.all([
      Category.findAll({ where: { organizationId }, order: [["name", "ASC"]] }),
      Idea.findAll({
        attributes: [[col("category"), "name"]],
        where: { organizationId, category: { [Op.ne]: null } },
        group: ["category"],
        raw: true,
      }),
    ]);

    // Merge: table entries take precedence; add any idea-derived names not already present.
    // All entries are normalised to plain objects so the response shape is consistent.
    const tableNames = new Set(tableCategories.map((c) => c.name));
    const merged = tableCategories.map((c) => ({ name: c.name }));
    for (const row of ideaCategories) {
      if (row.name && !tableNames.has(row.name)) {
        merged.push({ name: row.name });
      }
    }
    merged.sort((a, b) => a.name.localeCompare(b.name));

    logger.info("[Categories] Found categories:", merged.length);
    res.json(merged);
  } catch (error) {
    logger.error("[Categories] Error fetching categories:", error.message);
    logger.error("[Categories] Full error:", error);
    res.status(500).json({
      error: "Failed to fetch categories",
      message: error.message,
    });
  }
});

// Create category (authenticated users can create, but only admins can add descriptions)
router.post("/", async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: "Name required" });

    // Check if category already exists
    const existing = await Category.findOne({ where: { name } });
    if (existing) {
      return res.status(200).json(existing); // Return existing category
    }

    // Create new category
    const categoryData = {
      name,
      createdBy: req.user.id,
      organizationId: req.user.organizationId,
      tenant_id: req.user.tenant_id,
    };

    // Only admins can add descriptions
    if (req.user.isAdmin && description) {
      categoryData.description = description;
    }

    const cat = await Category.create(categoryData);
    await logAuditEvent(req, {
      action: "category.create",
      resourceType: "category",
      resourceId: cat.id,
      changes: { before: null, after: redactForAudit(cat.toJSON()) },
      status: "success",
    });
    return res.status(201).json(cat);
  } catch (error) {
    await logAuditEvent(req, {
      action: "category.create",
      resourceType: "category",
      changes: { before: null, after: null },
      status: "failure",
      metadata: { error: error.message },
    });
    throw error;
  }
});

// Update category (admin only)
router.put("/:id", requireAdmin, async (req, res) => {
  const { name, description } = req.body;
  const cat = await Category.findByPk(req.params.id);
  if (!cat) return res.status(404).json({ error: "Not found" });

  // SECURITY: Check category belongs to admin's organization
  if (req.user.organizationId && cat.organizationId !== req.user.organizationId) {
    return res.status(403).json({ error: "Cannot modify categories from other organizations" });
  }

  const beforeSnapshot = redactForAudit(cat.toJSON());
  try {
    if (name) cat.name = name;
    if (description !== undefined) cat.description = description;

    await cat.save();
    await logAuditEvent(req, {
      action: "category.update",
      resourceType: "category",
      resourceId: cat.id,
      changes: { before: beforeSnapshot, after: redactForAudit(cat.toJSON()) },
      status: "success",
    });
    return res.json(cat);
  } catch (error) {
    await logAuditEvent(req, {
      action: "category.update",
      resourceType: "category",
      resourceId: cat.id,
      changes: { before: beforeSnapshot, after: null },
      status: "failure",
      metadata: { error: error.message },
    });
    throw error;
  }
});

// Delete category (admin only)
router.delete("/:id", requireAdmin, async (req, res) => {
  const cat = await Category.findByPk(req.params.id);
  if (!cat) return res.status(404).json({ error: "Not found" });

  // SECURITY: Check category belongs to admin's organization
  if (req.user.organizationId && cat.organizationId !== req.user.organizationId) {
    return res.status(403).json({ error: "Cannot delete categories from other organizations" });
  }

  const beforeSnapshot = redactForAudit(cat.toJSON());
  try {
    await cat.destroy();
    await logAuditEvent(req, {
      action: "category.delete",
      resourceType: "category",
      resourceId: req.params.id,
      changes: { before: beforeSnapshot, after: null },
      status: "success",
    });
    return res.json({ success: true });
  } catch (error) {
    await logAuditEvent(req, {
      action: "category.delete",
      resourceType: "category",
      resourceId: req.params.id,
      changes: { before: beforeSnapshot, after: null },
      status: "failure",
      metadata: { error: error.message },
    });
    throw error;
  }
});

export default router;
