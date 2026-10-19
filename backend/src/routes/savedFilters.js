import express from "express";
import SavedFilter from "../models/SavedFilter.js";
import { formatServerError } from "../utils/formatServerError.js";
import { createLogger } from "../utils/logger.js";

const router = express.Router();

const ALLOWED_FILTER_KEYS = new Set(["sort", "status", "category", "search"]);

function sanitiseFilters(raw) {
  const out = {};
  for (const [k, v] of Object.entries(raw || {})) {
    if (ALLOWED_FILTER_KEYS.has(k) && typeof v === "string") {
      out[k] = v;
    }
  }
  return out;
}

// List saved filters for the current user
router.get("/", async (req, res) => {
  try {
    const filters = await SavedFilter.findAll({
      where: {
        userId: req.user.id,
        organizationId: req.user.organizationId,
        tenant_id: req.user.tenant_id,
      },
      attributes: ["id", "name", "filters", "createdAt"],
      order: [["createdAt", "ASC"]],
    });
    res.json(filters);
  } catch (err) {
    res
      .status(500)
      .json(formatServerError(err, "Failed to fetch saved filters", "[SavedFilters:list]"));
  }
});

// Save a new filter
router.post("/", async (req, res) => {
  const log = createLogger(req);
  const { name, filters } = req.body;
  if (!name?.trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  const sanitised = sanitiseFilters(filters);
  if (Object.keys(sanitised).length === 0) {
    return res.status(400).json({ error: "filters must contain at least one valid key" });
  }
  try {
    const saved = await SavedFilter.create({
      name: name.trim(),
      filters: sanitised,
      userId: req.user.id,
      organizationId: req.user.organizationId,
      tenant_id: req.user.tenant_id,
    });
    log.info(`[SavedFilters] Created "${saved.name}" for user ${req.user.id}`);
    res.status(201).json(saved);
  } catch (err) {
    res.status(500).json(formatServerError(err, "Failed to save filter", "[SavedFilters:create]"));
  }
});

// Delete a saved filter (owner only)
router.delete("/:id", async (req, res) => {
  const log = createLogger(req);
  try {
    const record = await SavedFilter.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id,
        organizationId: req.user.organizationId,
        tenant_id: req.user.tenant_id,
      },
    });
    if (!record) return res.status(404).json({ error: "Saved filter not found" });
    await record.destroy();
    log.info(`[SavedFilters] Deleted ${req.params.id} for user ${req.user.id}`);
    res.json({ success: true });
  } catch (err) {
    res
      .status(500)
      .json(formatServerError(err, "Failed to delete saved filter", "[SavedFilters:delete]"));
  }
});

export default router;
