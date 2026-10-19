import express from "express";
import { requireAdmin, requirePlatformOwner } from "../middleware/auth.js";
import { requireBulkInvitePlan } from "../middleware/planLimits.js";
import multer from "multer";
import csvParser from "csv-parser";
import { Readable } from "stream";
import { auditLogger } from "../middleware/auditLog.js";
import { logger } from "../utils/logger.js";
import { respondToServiceError } from "../services/errors.js";
import {
  listUsers,
  getUserProfile,
  setAdminFlag,
  updateUserEmail,
  triggerPasswordReset,
  approveUser,
  addToOrg,
  removeFromOrg,
  deleteUser,
  previewBulkImport,
  confirmBulkImport,
} from "../services/userService.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV files are allowed"));
    }
  },
});

function buildCtx(req) {
  return {
    user: req.user,
    organizationId: req.user?.organizationId || null,
    tx: req.transaction || null,
  };
}

router.get(
  "/",
  auditLogger({ action: "user.list", resourceType: "user" }),
  requireAdmin,
  async (req, res) => {
    try {
      const users = await listUsers(buildCtx(req));
      res.json(users);
    } catch (err) {
      return respondToServiceError(res, err, {
        fallbackMessage: "Internal server error",
        logContext: "[Users:list]",
      });
    }
  }
);

router.get("/profile", async (req, res) => {
  try {
    const user = await getUserProfile(req.user.id);
    res.json(user);
  } catch (err) {
    return respondToServiceError(res, err, {
      fallbackMessage: "Internal server error",
      logContext: "[Users:profile]",
    });
  }
});

const WALKTHROUGH_COLUMNS = {
  superuser: "hasSeenSuperuserWalkthrough",
  admin: "hasSeenAdminWalkthrough",
  user: "hasSeenUserWalkthrough",
};

// Step-position resume (companion to WALKTHROUGH_COLUMNS above). NULL means
// "no saved position, start at step 0".
const WALKTHROUGH_STEP_COLUMNS = {
  superuser: "superuserWalkthroughStep",
  admin: "adminWalkthroughStep",
  user: "userWalkthroughStep",
};

const MAX_WALKTHROUGH_STEP = 100;

router.patch("/walkthrough", async (req, res) => {
  const { type, step } = req.body;
  const seenColumn = WALKTHROUGH_COLUMNS[type];
  const stepColumn = WALKTHROUGH_STEP_COLUMNS[type];
  if (!seenColumn) {
    return res.status(400).json({ error: "Invalid walkthrough type" });
  }

  let stepValue = null;
  if (step !== undefined) {
    if (!Number.isInteger(step) || step < 0 || step >= MAX_WALKTHROUGH_STEP) {
      return res.status(400).json({ error: "Invalid walkthrough step" });
    }
    stepValue = step;
  }

  try {
    // No step supplied is the complete/legacy path: mark seen and clear any
    // saved position so a finished tour never resumes from a stale step.
    await req.user.update({ [seenColumn]: true, [stepColumn]: stepValue });
    res.json({ success: true });
  } catch (err) {
    return respondToServiceError(res, err, {
      fallbackMessage: "Internal server error",
      logContext: "[Users:walkthrough]",
    });
  }
});

router.patch(
  "/:id/admin",
  auditLogger({ action: "user.role-change", resourceType: "user", captureBody: true }),
  requireAdmin,
  async (req, res) => {
    try {
      const result = await setAdminFlag(buildCtx(req), req.params.id, req.body.isAdmin);
      res.json(result);
    } catch (err) {
      return respondToServiceError(res, err, {
        fallbackMessage: "Internal server error",
        logContext: "[Users:set-admin]",
      });
    }
  }
);

router.patch(
  "/:id/email",
  auditLogger({ action: "user.email-change", resourceType: "user", captureBody: true }),
  requireAdmin,
  async (req, res) => {
    try {
      const result = await updateUserEmail(buildCtx(req), req.params.id, req.body.email);
      res.json(result);
    } catch (err) {
      return respondToServiceError(res, err, {
        fallbackMessage: "Internal server error",
        logContext: "[Users:update-email]",
      });
    }
  }
);

router.post(
  "/:id/request-password-reset",
  auditLogger({ action: "user.password-reset.admin-trigger", resourceType: "user" }),
  requireAdmin,
  async (req, res) => {
    try {
      const result = await triggerPasswordReset(buildCtx(req), req.params.id);
      res.json(result);
    } catch (err) {
      return respondToServiceError(res, err, {
        fallbackMessage: "Failed to send password reset email",
        logContext: "[Users:password-reset]",
      });
    }
  }
);

router.post(
  "/:id/approve",
  auditLogger({ action: "user.approve", resourceType: "user" }),
  requireAdmin,
  async (req, res) => {
    try {
      const result = await approveUser(buildCtx(req), req.params.id);
      res.json(result);
    } catch (err) {
      return respondToServiceError(res, err, {
        fallbackMessage: "Failed to approve user",
        logContext: "[Users:approve]",
      });
    }
  }
);

router.post(
  "/add-to-org",
  auditLogger({ action: "user.add-to-org", resourceType: "user", captureBody: true }),
  requirePlatformOwner,
  async (req, res) => {
    try {
      const { identifier, isAdmin, isSuperuser } = req.body;
      if (!identifier) {
        return res.status(400).json({ error: "identifier is required" });
      }
      const result = await addToOrg(buildCtx(req), { identifier, isAdmin, isSuperuser });
      res.status(201).json(result);
    } catch (err) {
      return respondToServiceError(res, err, {
        fallbackMessage: "Failed to add user to organisation",
        logContext: "[Users:add-to-org]",
      });
    }
  }
);

router.delete(
  "/:id/org-membership",
  auditLogger({ action: "user.remove-from-org", resourceType: "user" }),
  requirePlatformOwner,
  async (req, res) => {
    try {
      const result = await removeFromOrg(buildCtx(req), req.params.id);
      res.json(result);
    } catch (err) {
      return respondToServiceError(res, err, {
        fallbackMessage: "Failed to remove user from organisation",
        logContext: "[Users:remove-from-org]",
      });
    }
  }
);

router.delete(
  "/:id",
  auditLogger({ action: "user.delete", resourceType: "user" }),
  requireAdmin,
  async (req, res) => {
    try {
      const result = await deleteUser(buildCtx(req), req.params.id);
      res.json(result);
    } catch (err) {
      return respondToServiceError(res, err, {
        fallbackMessage: "Internal server error",
        logContext: "[Users:delete]",
      });
    }
  }
);

// Bulk staff-list import (Issue #881 superseded the original single-shot
// from #865 / #880). Now a two-step preview-then-confirm flow.
//
// Step 1: POST /api/users/bulk-upload/preview
//   - validates the CSV (per-row format + dedup + safety caps)
//   - returns a dry-run summary and a signed `previewToken`
//   - no users created, no email enqueued
//
// Step 2: POST /api/users/bulk-upload/confirm
//   - requires the previewToken from step 1 AND the same CSV file
//   - verifies token (signature + uploader + org + file hash + TTL)
//   - re-validates (TOCTOU guard) and creates the still-accepted rows
//
// Gates on both endpoints match the #865 wrapper:
//   - requireAdmin: org-admin gate (not platform superuser)
//   - requireBulkInvitePlan: plan-tier gate (env BULK_INVITE_ALLOWED_PLANS)
//   - per-org volume caps + Resend reserve inside validateBulkImportRows
//
// Token binding is stateless HMAC (HS256 over JWT_SECRET); model + replay
// notes live in `utils/bulkImportPreviewToken.js`.

async function parseUploadedCsv(file) {
  const rows = [];
  const stream = Readable.from(file.buffer.toString());
  await new Promise((resolve, reject) => {
    stream
      .pipe(csvParser())
      .on("data", (data) => rows.push(data))
      .on("end", resolve)
      .on("error", reject);
  });
  return rows;
}

router.post(
  "/bulk-upload/preview",
  auditLogger({ action: "user.bulk-upload.preview", resourceType: "user", captureBody: false }),
  requireAdmin,
  requireBulkInvitePlan,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No CSV file uploaded" });
      }

      const rows = await parseUploadedCsv(req.file);
      logger.info(`[Users:bulk-upload/preview] Parsed ${rows.length} rows from CSV`);
      const result = await previewBulkImport(buildCtx(req), req.file.buffer, rows);
      res.json(result);
    } catch (err) {
      return respondToServiceError(res, err, {
        fallbackMessage: "Failed to preview bulk upload",
        logContext: "[Users:bulkUpload/preview]",
      });
    }
  }
);

router.post(
  "/bulk-upload/confirm",
  auditLogger({ action: "user.bulk-upload.confirm", resourceType: "user", captureBody: false }),
  requireAdmin,
  requireBulkInvitePlan,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No CSV file uploaded" });
      }
      const previewToken = req.body?.previewToken;
      if (!previewToken || typeof previewToken !== "string") {
        return res.status(400).json({
          error: "Preview token is required",
          code: "PREVIEW_TOKEN_MISSING",
        });
      }

      const rows = await parseUploadedCsv(req.file);
      logger.info(`[Users:bulk-upload/confirm] Parsed ${rows.length} rows from CSV`);
      const result = await confirmBulkImport(buildCtx(req), req.file.buffer, rows, previewToken);
      res.json(result);
    } catch (err) {
      return respondToServiceError(res, err, {
        fallbackMessage: "Failed to confirm bulk upload",
        logContext: "[Users:bulkUpload/confirm]",
      });
    }
  }
);

export default router;
