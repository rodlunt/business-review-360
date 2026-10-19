import express from "express";
import { requireAdmin, requireSameOrganization } from "../middleware/auth.js";
import { validateProfanity } from "../middleware/profanityFilter.js";
import { checkPlanLimit } from "../middleware/planLimits.js";
import { respondToServiceError } from "../services/errors.js";
import { createLogger } from "../utils/logger.js";
import { logAuditEvent } from "../middleware/auditLog.js";
import {
  listIdeas,
  getIdeaByIdentifier,
  createIdea,
  updateIdea,
  deleteIdea,
  adminUpdateIdea,
  batchUpdateIdeas,
  getChangelogCount,
  MAX_LIMIT,
} from "../services/ideaService.js";

const router = express.Router();

function buildCtx(req) {
  return {
    user: req.user,
    organizationId: req.user.organizationId,
    tx: req.transaction || null,
  };
}

router.get("/", requireSameOrganization, async (req, res) => {
  try {
    const result = await listIdeas(buildCtx(req), req.query);
    if (result.clamped) res.setHeader("X-RateLimit-Clamp", `limit=${MAX_LIMIT}`);
    res.json({ ideas: result.ideas, pagination: result.pagination });
  } catch (err) {
    return respondToServiceError(res, err, {
      fallbackMessage: "Failed to fetch ideas",
      logContext: "Error fetching ideas:",
    });
  }
});

// Issue #521: personal changelog -- must be before /:identifier to avoid capture
router.get("/changelog", requireSameOrganization, async (req, res) => {
  try {
    const since = req.user.lastSeenAt;
    if (!since) {
      return res.json({ count: 0, since: null });
    }
    const count = await getChangelogCount(buildCtx(req), since);
    res.json({ count, since });
  } catch (err) {
    return respondToServiceError(res, err, {
      fallbackMessage: "Failed to fetch changelog",
      logContext: "[Ideas] Error fetching changelog:",
    });
  }
});

router.post("/changelog/dismiss", requireSameOrganization, async (req, res) => {
  try {
    await req.user.update({ lastSeenAt: new Date() });
    res.json({ ok: true });
  } catch (err) {
    return respondToServiceError(res, err, {
      fallbackMessage: "Failed to dismiss changelog",
      logContext: "[Ideas] Error dismissing changelog:",
    });
  }
});

router.get("/:identifier", requireSameOrganization, async (req, res) => {
  try {
    const idea = await getIdeaByIdentifier(buildCtx(req), req.params.identifier);
    res.json(idea);
  } catch (err) {
    return respondToServiceError(res, err, {
      fallbackMessage: "Failed to fetch idea",
      logContext: "Error fetching idea:",
    });
  }
});

router.post(
  "/",
  requireSameOrganization,
  checkPlanLimit("maxIdeas"),
  validateProfanity(["title", "description", "solution", "additionalComments"]),
  async (req, res) => {
    try {
      const idea = await createIdea(buildCtx(req), req.body);
      res.status(201).json(idea);
    } catch (err) {
      return respondToServiceError(res, err, {
        fallbackMessage: "Failed to create idea",
        logContext: "[Ideas] Error creating idea:",
      });
    }
  }
);

router.put(
  "/:id",
  requireSameOrganization,
  validateProfanity(["title", "description", "solution", "additionalComments"]),
  async (req, res) => {
    try {
      const idea = await updateIdea(buildCtx(req), req.params.id, req.body);
      res.json(idea);
    } catch (err) {
      return respondToServiceError(res, err, {
        fallbackMessage: "Failed to edit idea",
        logContext: "[Ideas:edit]",
      });
    }
  }
);

router.delete("/:id", requireSameOrganization, async (req, res) => {
  try {
    const result = await deleteIdea(buildCtx(req), req.params.id);
    res.json(result);
  } catch (err) {
    return respondToServiceError(res, err, {
      fallbackMessage: "Failed to delete idea",
      logContext: "[Ideas:delete]",
    });
  }
});

router.post("/batch", requireSameOrganization, requireAdmin, async (req, res) => {
  const logger = createLogger(req);
  try {
    const result = await batchUpdateIdeas(buildCtx(req), req.body || {});

    try {
      await logAuditEvent(req, {
        action: "idea.batch",
        resourceType: "idea",
        resourceId: null,
        changes: {
          batchAction: req.body.action,
          payload: req.body.payload,
          count: result.ids.length,
          ids: result.ids,
        },
        status: "success",
      });
    } catch (auditErr) {
      logger.error("Failed to write batch audit log", { message: auditErr.message });
      return res.status(500).json({
        error: "Batch update succeeded but audit log write failed.",
        code: "BATCH_AUDIT_WRITE_FAILED",
      });
    }

    res.json(result);
  } catch (err) {
    return respondToServiceError(res, err, {
      fallbackMessage: "Batch update failed",
      logContext: "[Ideas:batch]",
    });
  }
});

router.patch(
  "/:id/admin",
  requireSameOrganization,
  requireAdmin,
  validateProfanity(["adminComment"]),
  async (req, res) => {
    try {
      const idea = await adminUpdateIdea(buildCtx(req), req.params.id, req.body);
      res.json(idea);
    } catch (err) {
      return respondToServiceError(res, err, {
        fallbackMessage: "Admin update failed",
        logContext: "[Ideas:admin-update]",
      });
    }
  }
);

export default router;
