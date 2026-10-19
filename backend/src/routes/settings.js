import express from "express";
import { requireSuperuser, requireSameOrganization } from "../middleware/auth.js";
import Organization from "../models/Organization.js";
import upload, { storageAdapter } from "../middleware/upload.js";
import { validateFileMagicBytes } from "../middleware/validateFileMagicBytes.js";
import { validateText } from "../middleware/profanityFilter.js";
import { formatServerError } from "../utils/formatServerError.js";
import { logAuditEvent, redactForAudit } from "../middleware/auditLog.js";
import { loadDemoData, removeDemoData } from "../services/demoDataService.js";
import path from "path";
import { logger, createLogger } from "../utils/logger.js";

// #720: split into public + protected sub-routers so this file no longer
// imports `authenticate` directly. authenticate is mounted in index.js
// on the protected router.
export const publicRouter = express.Router();
export const protectedRouter = express.Router();

// Update settings (superuser only -- org name, branding, registration, CAPTCHA, etc.)
protectedRouter.post("/", requireSameOrganization, requireSuperuser, async (req, res) => {
  const updates = req.body;

  logger.info("[Settings POST] Received updates:", updates);
  logger.info("[Settings POST] req.user:", req.user);

  // Ensure user can only update their own organization's settings
  if (!req.user.organizationId) {
    return res.status(403).json({
      error: "User account is missing organization information. Please contact support.",
    });
  }

  // Validate text fields for profanity
  const textFields = ["organizationName", "organizationDescription"];
  for (const field of textFields) {
    if (updates[field]) {
      const validation = await validateText(updates[field]);
      if (!validation.isValid) {
        return res.status(400).json({
          error: "Profanity detected",
          field,
          message: validation.error,
        });
      }
    }
  }

  // NOTE: Settings table is NO LONGER USED for organization settings
  // All organization settings are stored in Organizations table
  // Settings table is only used for global app settings (like profanity filter)

  // Capture before-state for audit
  const orgBefore = await Organization.findOne({
    where: { organizationId: req.user.organizationId },
  });
  const beforeSnapshot = orgBefore ? redactForAudit(orgBefore.toJSON()) : null;

  // Update Organizations table if user has organizationId
  if (req.user.organizationId) {
    const orgUpdates = {};

    // Map settings fields to Organizations table columns
    if (updates.organizationName) orgUpdates.organizationName = updates.organizationName;
    if (updates.organizationDescription)
      orgUpdates.organizationDescription = updates.organizationDescription;
    if (updates.primaryColor) orgUpdates.primaryColor = updates.primaryColor;
    if (updates.logoHighContrast !== undefined)
      orgUpdates.logoHighContrast = updates.logoHighContrast;
    if (updates.bigQuestion !== undefined) orgUpdates.bigQuestion = updates.bigQuestion;
    if (updates.useCaptcha !== undefined) orgUpdates.useCaptcha = updates.useCaptcha;
    if (updates.allowAnonymousIdeas !== undefined)
      orgUpdates.allowAnonymousIdeas = updates.allowAnonymousIdeas;
    if (updates.requireApproval !== undefined) orgUpdates.requireApproval = updates.requireApproval;
    if (updates.maxIdeasPerUser !== undefined) orgUpdates.maxIdeasPerUser = updates.maxIdeasPerUser;
    if (updates.enablePwaPrompt !== undefined) orgUpdates.enablePwaPrompt = updates.enablePwaPrompt;
    if (updates.allowSelfRegistration !== undefined)
      orgUpdates.allowSelfRegistration = updates.allowSelfRegistration;
    if (updates.domainRestrictionMode !== undefined)
      orgUpdates.domainRestrictionMode = updates.domainRestrictionMode;
    if (updates.allowedDomains !== undefined) orgUpdates.allowedDomains = updates.allowedDomains;
    if (updates.blockedDomains !== undefined) orgUpdates.blockedDomains = updates.blockedDomains;
    if (updates.oauthGoogleEnabled !== undefined)
      orgUpdates.oauthGoogleEnabled = updates.oauthGoogleEnabled;
    if (updates.oauthGithubEnabled !== undefined)
      orgUpdates.oauthGithubEnabled = updates.oauthGithubEnabled;
    if (updates.oauthMicrosoftEnabled !== undefined)
      orgUpdates.oauthMicrosoftEnabled = updates.oauthMicrosoftEnabled;
    if (updates.ssoAzureEnabled !== undefined) orgUpdates.ssoAzureEnabled = updates.ssoAzureEnabled;
    if (updates.ssoAzureTenantId !== undefined)
      orgUpdates.ssoAzureTenantId = updates.ssoAzureTenantId;
    if (updates.ssoAllowedDomains !== undefined)
      orgUpdates.ssoAllowedDomains = updates.ssoAllowedDomains;
    if (updates.oauthAutoSuperuser !== undefined)
      orgUpdates.oauthAutoSuperuser = updates.oauthAutoSuperuser;

    if (Object.keys(orgUpdates).length > 0) {
      try {
        await Organization.update(orgUpdates, {
          where: { organizationId: req.user.organizationId },
        });
        logger.info(`[Settings] Updated organization ${req.user.organizationId}:`, orgUpdates);
        const orgAfter = await Organization.findOne({
          where: { organizationId: req.user.organizationId },
        });
        await logAuditEvent(req, {
          action: "settings.update",
          resourceType: "settings",
          resourceId: orgBefore?.id,
          changes: {
            before: beforeSnapshot,
            after: orgAfter ? redactForAudit(orgAfter.toJSON()) : null,
          },
          status: "success",
        });
      } catch (error) {
        await logAuditEvent(req, {
          action: "settings.update",
          resourceType: "settings",
          resourceId: orgBefore?.id,
          changes: { before: beforeSnapshot, after: null },
          status: "failure",
          metadata: { error: error.message },
        });
        throw error;
      }
    }
  } else {
    logger.info("[Settings POST] User has no organizationId, not updating Organizations table");
  }

  res.json({ success: true });
});

// Get organization settings for landing pages (public)
publicRouter.get("/organization/:organizationId/public", async (req, res) => {
  try {
    const { organizationId } = req.params;
    logger.info("[Settings] Looking for org (public):", organizationId);

    // Try to find organization in Organizations table
    const organization = await Organization.findOne({
      where: { organizationId },
    });

    logger.info("[Settings] Found org (public):", organization ? organization.toJSON() : null);

    if (!organization) {
      logger.info("[Settings] Organization not found (public)");
      return res.status(404).json({ error: "Organization not found" });
    }

    // Return only public organization settings (no sensitive data)
    const settings = {
      organizationId: organization.organizationId,
      organizationName: organization.organizationName,
      organizationDescription: organization.organizationDescription,
      primaryColor: organization.primaryColor,
      logoUrl: organization.logoUrl,
      logoHighContrast: organization.logoHighContrast,
      useCaptcha: organization.useCaptcha,
      // OAuth/SSO provider flags: login/register forms read these to show/hide buttons
      oauthGoogleEnabled: organization.oauthGoogleEnabled ?? false,
      oauthGithubEnabled: organization.oauthGithubEnabled ?? false,
      oauthMicrosoftEnabled: organization.oauthMicrosoftEnabled ?? false,
      ssoAzureEnabled: organization.ssoAzureEnabled ?? false,
    };

    res.json(settings);
  } catch (error) {
    // Issue #547
    res
      .status(500)
      .json(formatServerError(error, "Failed to load organization settings", "[Settings:public]"));
  }
});

// Get organization settings (authenticated users can only access their own org)
protectedRouter.get("/organization/:organizationId", requireSameOrganization, async (req, res) => {
  try {
    const { organizationId } = req.params;
    logger.info("[Settings] Looking for org:", organizationId);

    // Try to find organization in Organizations table
    const organization = await Organization.findOne({
      where: { organizationId },
    });

    logger.info("[Settings] Found org:", organization ? organization.toJSON() : null);

    if (!organization) {
      logger.info("[Settings] Organization not found");
      return res.status(404).json({ error: "Organization not found" });
    }

    // Return organization settings
    const settings = {
      organizationId: organization.organizationId,
      organizationName: organization.organizationName,
      organizationDescription: organization.organizationDescription,
      primaryColor: organization.primaryColor,
      logoUrl: organization.logoUrl,
      logoHighContrast: organization.logoHighContrast,
      bigQuestion: organization.bigQuestion,
      useCaptcha: organization.useCaptcha,
      allowAnonymousIdeas: organization.allowAnonymousIdeas,
      requireApproval: organization.requireApproval,
      maxIdeasPerUser: organization.maxIdeasPerUser,
      enablePwaPrompt: organization.enablePwaPrompt,
      allowSelfRegistration: organization.allowSelfRegistration,
      domainRestrictionMode: organization.domainRestrictionMode,
      allowedDomains: organization.allowedDomains,
      blockedDomains: organization.blockedDomains,
      demoDataLoaded: organization.demoDataLoaded,
      setupWizardCompleted: organization.setupWizardCompleted,
      setupWizardStep: organization.setupWizardStep,
      oauthGoogleEnabled: organization.oauthGoogleEnabled ?? false,
      oauthGithubEnabled: organization.oauthGithubEnabled ?? false,
      oauthMicrosoftEnabled: organization.oauthMicrosoftEnabled ?? false,
      ssoAzureEnabled: organization.ssoAzureEnabled ?? false,
      ssoAzureTenantId: organization.ssoAzureTenantId || null,
      ssoAllowedDomains: organization.ssoAllowedDomains ?? [],
      oauthAutoSuperuser: organization.oauthAutoSuperuser ?? false,
    };

    res.json(settings);
  } catch (error) {
    // Issue #547
    res
      .status(500)
      .json(formatServerError(error, "Failed to load organization settings", "[Settings:authed]"));
  }
});

// Update setup wizard progress (superuser only) -- Issue #526
protectedRouter.patch(
  "/setup-wizard",
  requireSameOrganization,
  requireSuperuser,
  async (req, res) => {
    const log = createLogger(req);
    try {
      const organizationId = req.user.organizationId;
      if (!organizationId) {
        return res.status(403).json({ error: "User account is missing organisation information." });
      }
      const { step, completed } = req.body;
      const updates = {};
      if (typeof step === "number" && step >= 0 && step <= 10) {
        updates.setupWizardStep = step;
      }
      if (completed === true) {
        updates.setupWizardCompleted = true;
        updates.setupWizardStep = 0;
      }
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "step or completed is required" });
      }
      await Organization.update(updates, { where: { organizationId } });
      log.info(`[SetupWizard] Updated org ${organizationId}: ${JSON.stringify(updates)}`);
      res.json({ success: true });
    } catch (err) {
      res
        .status(500)
        .json(formatServerError(err, "Failed to update setup wizard", "[SetupWizard:update]"));
    }
  }
);

// Load demo data (superuser only) -- Issue #527
protectedRouter.post("/demo-data", requireSameOrganization, requireSuperuser, async (req, res) => {
  const log = createLogger(req);
  try {
    const organizationId = req.user.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: "User account is missing organisation information." });
    }

    const org = await Organization.findOne({ where: { organizationId } });
    if (!org) {
      return res.status(404).json({ error: "Organisation not found." });
    }
    if (org.demoDataLoaded) {
      return res.status(409).json({ error: "Demo data is already loaded. Remove it first." });
    }

    if (!req.tenant?.id) {
      return res.status(500).json({ error: "Tenant context unavailable." });
    }

    const { ideaCount } = await loadDemoData({
      tenantId: req.tenant.id,
      organizationId,
      adminUserId: req.user.id,
    });

    await logAuditEvent(req, {
      action: "demo.data.loaded",
      resourceType: "settings",
      resourceId: org.id,
      changes: { ideaCount },
      status: "success",
    });

    log.info(`[Settings] Demo data loaded for ${organizationId}: ${ideaCount} ideas`);
    res.json({ success: true, ideaCount });
  } catch (error) {
    res
      .status(500)
      .json(formatServerError(error, "Failed to load demo data", "[Settings:demoLoad]"));
  }
});

// Remove demo data (superuser only) -- Issue #527
protectedRouter.delete(
  "/demo-data",
  requireSameOrganization,
  requireSuperuser,
  async (req, res) => {
    const log = createLogger(req);
    try {
      const organizationId = req.user.organizationId;
      if (!organizationId) {
        return res.status(403).json({ error: "User account is missing organisation information." });
      }

      const org = await Organization.findOne({ where: { organizationId } });
      if (!org) {
        return res.status(404).json({ error: "Organisation not found." });
      }

      if (!req.tenant?.id) {
        return res.status(500).json({ error: "Tenant context unavailable." });
      }

      const { removedCount } = await removeDemoData({
        tenantId: req.tenant.id,
        organizationId,
      });

      await logAuditEvent(req, {
        action: "demo.data.removed",
        resourceType: "settings",
        resourceId: org.id,
        changes: { removedCount },
        status: "success",
      });

      log.info(`[Settings] Demo data removed for ${organizationId}: ${removedCount} ideas deleted`);
      res.json({ success: true, removedCount });
    } catch (error) {
      res
        .status(500)
        .json(formatServerError(error, "Failed to remove demo data", "[Settings:demoRemove]"));
    }
  }
);

// Logo upload endpoint (superuser only)
protectedRouter.post(
  "/upload-logo",
  requireSameOrganization,
  requireSuperuser,
  upload.single("logo"),
  // Magic-byte validation runs on the in-memory buffer BEFORE the handler
  // saves it to disk via storageAdapter. Rejection sends HTTP 415.
  validateFileMagicBytes(),
  async (req, res) => {
    try {
      logger.info("[Logo Upload Backend] Request received:", {
        timestamp: new Date().toISOString(),
        userId: req.user?.id,
        userIsAdmin: req.user?.isAdmin,
        hasFile: !!req.file,
        headers: {
          contentType: req.headers["content-type"],
          contentLength: req.headers["content-length"],
        },
      });

      if (req.file) {
        logger.info("[Logo Upload Backend] File details:", {
          originalname: req.file.originalname,
          filename: req.file.filename,
          mimetype: req.file.mimetype,
          size: req.file.size,
        });
      }

      if (!req.file) {
        logger.error("[Logo Upload Backend] No file in request");
        return res.status(400).json({ error: "No file uploaded" });
      }

      // Ensure user has organizationId
      if (!req.user.organizationId) {
        logger.error("[Logo Upload Backend] User has no organizationId");
        return res.status(403).json({
          error: "User account is missing organization information. Please contact support.",
        });
      }

      // Get the old logo URL from Organizations table to delete it
      const organization = await Organization.findOne({
        where: { organizationId: req.user.organizationId },
      });
      const oldLogoUrl = organization?.logoUrl;
      const beforeLogoUrl = oldLogoUrl || null;

      // Persist the validated buffer via the storage adapter.
      // Frontend constructs the full URL from current protocol/hostname.
      await storageAdapter.save(req.file.filename, req.file.buffer);
      const logoUrl = `/uploads/${req.file.filename}`;
      logger.info("[Logo Upload Backend] Saving logoUrl to database:", logoUrl);

      try {
        // Update Organizations table with new logo URL
        await Organization.update(
          { logoUrl },
          { where: { organizationId: req.user.organizationId } }
        );
        logger.info(
          `[Logo Upload Backend] Updated organization ${req.user.organizationId} logoUrl`
        );

        // Delete old logo file if it exists and differs from the new one
        if (oldLogoUrl && oldLogoUrl !== logoUrl) {
          try {
            await storageAdapter.delete(path.basename(oldLogoUrl));
            logger.info("[Logo Upload Backend] Deleted old logo:", oldLogoUrl);
          } catch (deleteError) {
            logger.error("[Logo Upload Backend] Failed to delete old logo:", deleteError.message);
            // Don't fail the upload if delete fails
          }
        }

        logger.info("[Logo Upload Backend] Upload completed successfully");
        await logAuditEvent(req, {
          action: "settings.logo.upload",
          resourceType: "settings",
          resourceId: organization?.id,
          changes: { before: { logo_url: beforeLogoUrl }, after: { logo_url: logoUrl } },
          status: "success",
        });
        // Return the path to the uploaded logo
        return res.json({
          success: true,
          logoUrl,
          message: "Logo uploaded successfully",
        });
      } catch (error) {
        await logAuditEvent(req, {
          action: "settings.logo.upload",
          resourceType: "settings",
          resourceId: organization?.id,
          changes: { before: { logo_url: beforeLogoUrl }, after: null },
          status: "failure",
          metadata: { error: error.message },
        });
        throw error;
      }
    } catch (error) {
      // Issue #547
      res
        .status(500)
        .json(formatServerError(error, "Failed to upload logo", "[Settings:logoUpload]"));
    }
  }
);

protectedRouter.delete("/logo", requireSameOrganization, requireSuperuser, async (req, res) => {
  try {
    const organization = await Organization.findOne({
      where: { organizationId: req.user.organizationId },
    });
    if (!organization) {
      return res.status(404).json({ error: "Organisation not found" });
    }
    const oldLogoUrl = organization.logoUrl;
    if (!oldLogoUrl) {
      return res.status(404).json({ error: "No logo to delete" });
    }

    await Organization.update(
      { logoUrl: null },
      { where: { organizationId: req.user.organizationId } }
    );

    try {
      await storageAdapter.delete(path.basename(oldLogoUrl));
    } catch (deleteError) {
      logger.error("[Logo Delete] Failed to delete logo file:", deleteError.message);
    }

    await logAuditEvent(req, {
      action: "settings.logo.delete",
      resourceType: "settings",
      resourceId: organization.id,
      changes: { before: { logo_url: oldLogoUrl }, after: { logo_url: null } },
      status: "success",
    });

    return res.json({ success: true, message: "Logo deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json(formatServerError(error, "Failed to delete logo", "[Settings:logoDelete]"));
  }
});
