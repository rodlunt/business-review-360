/**
 * UserService: HTTP-agnostic business logic for user management.
 *
 * Issue #485, Phase 4. Design spec:
 *   docs/superpowers/specs/2026-04-29-485-domain-service-layer-design.md
 *
 * ctx shape: { user, organizationId, tx }
 *   - user: the authenticated admin (for cross-org guards)
 *   - organizationId: string (the admin's org)
 */

import crypto from "crypto";
import { Op } from "sequelize";
import User from "../models/User.js";
import UserOrganizationMembership from "../models/UserOrganizationMembership.js";
import { isValidUUID } from "../utils/validation.js";
import { hashPassword } from "../utils/passwordHash.js";
import {
  sendPasswordResetEmail,
  sendTeamInviteEmail,
  sendUserAccountApprovedEmail,
} from "./notificationEmailService.js";
import { EmailPriority } from "./emailPriority.js";
import { assertBulkImportWithinCaps, scheduledForBulkInvite } from "./bulkImportCaps.js";
import {
  hashFileBuffer,
  signPreviewToken,
  verifyPreviewToken,
} from "../utils/bulkImportPreviewToken.js";
import { logger } from "../utils/logger.js";
import { NotFoundError, ForbiddenError, ValidationError, ConflictError } from "./errors.js";

/**
 * List all users for the admin's organisation, including cross-org members.
 *
 * Queries the membership table (no RLS) to find all user IDs, then fetches
 * User records on the privileged connection (BYPASSRLS) so cross-org members
 * whose home org differs from the current org are still returned.
 *
 * @param {{ organizationId: string }} ctx
 * @returns {object[]} User records merged with per-org membership flags
 */
export async function listUsers(ctx) {
  const { organizationId } = ctx;
  if (!organizationId) {
    throw new ForbiddenError(
      "User account is missing organisation information. Please contact support.",
      { code: "USER_NO_ORG" }
    );
  }

  const memberships = await UserOrganizationMembership.findAll({
    where: { organizationId },
    attributes: ["userId", "isAdmin", "isSuperuser", "isApproved"],
  });

  if (memberships.length === 0) return [];

  const membershipMap = Object.fromEntries(memberships.map((m) => [m.userId, m]));
  const userIds = memberships.map((m) => m.userId);

  // Standalone query (no req.transaction) runs on the privileged connection
  // with BYPASSRLS, so cross-org members are visible.
  const users = await User.findAll({
    where: { id: { [Op.in]: userIds } },
    attributes: ["id", "username", "email", "isAdmin", "isApproved", "organizationId", "createdAt"],
    order: [
      ["isApproved", "ASC"],
      ["createdAt", "DESC"],
    ],
  });

  return users.map((u) => {
    const m = membershipMap[u.id];
    return {
      id: u.id,
      username: u.username,
      email: u.email,
      organizationId: u.organizationId,
      isHomeOrg: u.organizationId === organizationId,
      isAdmin: m?.isAdmin ?? u.isAdmin,
      isSuperuser: m?.isSuperuser ?? u.isSuperuser,
      isApproved: m?.isApproved ?? u.isApproved,
      createdAt: u.createdAt,
    };
  });
}

/**
 * Fetch a user's own profile.
 *
 * @param {string} userId
 * @returns {object} User record
 */
export async function getUserProfile(userId) {
  const user = await User.findByPk(userId, {
    attributes: ["id", "username", "email", "isAdmin", "isAnonymous"],
  });
  if (!user) throw new NotFoundError("User not found", { code: "USER_NOT_FOUND" });
  return user;
}

/**
 * Promote or demote a user to/from admin.
 *
 * @param {{ organizationId: string, user: { organizationId: string } }} ctx
 * @param {string} userId UUID
 * @param {boolean} isAdmin
 * @returns {{ success: true, user: object }}
 */
export async function setAdminFlag(ctx, userId, isAdmin) {
  if (!isValidUUID(userId)) throw new NotFoundError("User not found", { code: "USER_NOT_FOUND" });

  const user = await User.findByPk(userId);
  if (!user) throw new NotFoundError("User not found", { code: "USER_NOT_FOUND" });

  if (ctx.organizationId && user.organizationId !== ctx.organizationId) {
    throw new ForbiddenError("Cannot modify users from other organisations", {
      code: "CROSS_ORG_FORBIDDEN",
    });
  }

  user.isAdmin = !!isAdmin;
  await user.save();
  return { success: true, user };
}

/**
 * Update a user's email address.
 *
 * @param {{ organizationId: string }} ctx
 * @param {string} userId UUID
 * @param {string} email New email
 * @returns {{ success: true, message: string, user: object }}
 */
export async function updateUserEmail(ctx, userId, email) {
  if (!isValidUUID(userId)) throw new NotFoundError("User not found", { code: "USER_NOT_FOUND" });

  if (!email) throw new ValidationError("Email is required", { code: "EMAIL_REQUIRED" });

  const normalizedEmail = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalizedEmail)) {
    throw new ValidationError("Invalid email format", { code: "EMAIL_INVALID" });
  }

  const existingUser = await User.findOne({ where: { email: normalizedEmail } });
  if (existingUser && existingUser.id !== userId) {
    throw new ConflictError("Email is already in use by another user", {
      code: "EMAIL_CONFLICT",
    });
  }

  const user = await User.findByPk(userId);
  if (!user) throw new NotFoundError("User not found", { code: "USER_NOT_FOUND" });

  if (ctx.organizationId && user.organizationId !== ctx.organizationId) {
    throw new ForbiddenError("Cannot modify users from other organisations", {
      code: "CROSS_ORG_FORBIDDEN",
    });
  }

  user.email = normalizedEmail;
  if (user.isAnonymous) user.isAnonymous = false;
  await user.save();

  return {
    success: true,
    message: "Email updated successfully",
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      isAdmin: user.isAdmin,
      isAnonymous: user.isAnonymous,
    },
  };
}

/**
 * Generate a password reset token and send the reset email.
 *
 * @param {{ organizationId: string }} ctx
 * @param {string} userId UUID
 * @returns {{ success: true, message: string }}
 */
export async function triggerPasswordReset(ctx, userId) {
  if (!isValidUUID(userId)) throw new NotFoundError("User not found", { code: "USER_NOT_FOUND" });

  const user = await User.findByPk(userId);
  if (!user) throw new NotFoundError("User not found", { code: "USER_NOT_FOUND" });

  if (ctx.organizationId && user.organizationId !== ctx.organizationId) {
    throw new ForbiddenError("Cannot send password reset for users from other organisations", {
      code: "CROSS_ORG_FORBIDDEN",
    });
  }

  if (!user.email || user.isAnonymous) {
    throw new ValidationError("Cannot send password reset email - user has no email address", {
      code: "USER_NO_EMAIL",
    });
  }

  if (!user.organizationId) {
    throw new ForbiddenError(
      "User account is missing organisation information. Please contact support.",
      { code: "USER_NO_ORG" }
    );
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

  user.passwordResetToken = hashedToken;
  user.passwordResetExpires = new Date(Date.now() + 1000 * 60 * 30);
  await user.save();

  await sendPasswordResetEmail(user.email, rawToken, user.organizationId);

  return { success: true, message: `Password reset email sent to ${user.email}` };
}

/**
 * Send an account-setup email to a bulk-imported user (48-hour token).
 *
 * @param {User} user - Sequelize User instance (already saved)
 * @param {Object} [opts] - Issue #865 bulk-import knobs
 * @param {number} [opts.priority] - EmailPriority override (default CRITICAL for single invites; BATCH for bulk imports)
 * @param {Date}   [opts.scheduledFor] - Defer queue pickup (default now; staggered for bulk to respect the Resend reserve)
 */
async function triggerAccountSetup(user, { priority, scheduledFor } = {}) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

  user.passwordResetToken = hashedToken;
  user.passwordResetExpires = new Date(Date.now() + 1000 * 60 * 60 * 48);
  await user.save();

  const { default: Organization } = await import("../models/Organization.js");
  const org = await Organization.findOne({ where: { organizationId: user.organizationId } });

  await sendTeamInviteEmail(user.email, user.username, rawToken, user.organizationId, org, {
    ...(priority !== undefined ? { priority } : {}),
    ...(scheduledFor ? { scheduledFor } : {}),
  });
}

/**
 * Approve a user account. Sends approval notification email (non-blocking).
 *
 * @param {{ organizationId: string }} ctx
 * @param {string} userId UUID
 * @returns {{ success: true, message: string, user: object }}
 */
export async function approveUser(ctx, userId) {
  if (!isValidUUID(userId)) throw new NotFoundError("User not found", { code: "USER_NOT_FOUND" });

  const user = await User.findByPk(userId);
  if (!user) throw new NotFoundError("User not found", { code: "USER_NOT_FOUND" });

  if (ctx.organizationId && user.organizationId !== ctx.organizationId) {
    throw new ForbiddenError("Cannot approve users from other organisations", {
      code: "CROSS_ORG_FORBIDDEN",
    });
  }

  if (user.isApproved) {
    throw new ValidationError("User is already approved", { code: "USER_ALREADY_APPROVED" });
  }

  user.isApproved = true;
  await user.save();

  await UserOrganizationMembership.update(
    { isApproved: true },
    { where: { userId: user.id, organizationId: user.organizationId } }
  );

  logger.info(`[UserService] User ${user.username} (${user.id}) approved`);

  if (user.email) {
    const { default: Organization } = await import("../models/Organization.js");
    const org = await Organization.findOne({ where: { organizationId: user.organizationId } });

    sendUserAccountApprovedEmail(user.email, {
      userName: user.username,
      organizationId: user.organizationId,
      organization: org,
    }).catch((err) => {
      logger.error(`[UserService] Failed to send approval email to ${user.email}:`, err.message);
    });
  }

  return {
    success: true,
    message: "User approved successfully",
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      isApproved: user.isApproved,
      isAdmin: user.isAdmin,
    },
  };
}

/**
 * Add an existing user to an org by UUID, email, or username.
 *
 * The user lookup runs without the tenant transaction (privileged BYPASSRLS
 * connection) so users from other orgs can be found by email/username.
 *
 * @param {{ organizationId: string }} ctx
 * @param {{ identifier: string, isAdmin?: boolean, isSuperuser?: boolean }} options
 */
export async function addToOrg(ctx, { identifier, isAdmin = false, isSuperuser = false }) {
  const { organizationId } = ctx;
  if (!organizationId) {
    throw new ForbiddenError("User account is missing organisation information.", {
      code: "USER_NO_ORG",
    });
  }
  if (!identifier) {
    throw new ValidationError("identifier (email, username, or user ID) is required", {
      code: "IDENTIFIER_REQUIRED",
    });
  }

  let user;
  const trimmed = identifier.trim();
  if (isValidUUID(trimmed)) {
    user = await User.findByPk(trimmed);
  } else if (trimmed.includes("@")) {
    user = await User.findOne({ where: { email: trimmed.toLowerCase() } });
  } else {
    user = await User.findOne({ where: { username: trimmed } });
  }

  if (!user) throw new NotFoundError("User not found", { code: "USER_NOT_FOUND" });

  const existing = await UserOrganizationMembership.findOne({
    where: { userId: user.id, organizationId },
  });
  if (existing) {
    throw new ConflictError("User is already a member of this organisation", {
      code: "ALREADY_MEMBER",
    });
  }

  await UserOrganizationMembership.create({
    userId: user.id,
    organizationId,
    isAdmin,
    isSuperuser,
    isApproved: true,
  });

  logger.info(`[UserService] User ${user.username} (${user.id}) added to org ${organizationId}`);

  return {
    success: true,
    message: `${user.username} added to organisation`,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      isAdmin,
      isSuperuser,
      isApproved: true,
      isHomeOrg: user.organizationId === organizationId,
      organizationId: user.organizationId,
      createdAt: user.createdAt,
    },
  };
}

/**
 * Remove a user's membership from an org. Does not delete the user account.
 * Guards against removing home-org membership (that requires full deletion).
 *
 * @param {{ organizationId: string, user: { id: string } }} ctx
 * @param {string} userId UUID
 */
export async function removeFromOrg(ctx, userId) {
  const { organizationId } = ctx;
  if (!organizationId) {
    throw new ForbiddenError("User account is missing organisation information.", {
      code: "USER_NO_ORG",
    });
  }
  if (!isValidUUID(userId)) throw new NotFoundError("User not found", { code: "USER_NOT_FOUND" });
  if (userId === ctx.user.id) {
    throw new ValidationError("Cannot remove yourself from the organisation", {
      code: "USER_SELF_REMOVE",
    });
  }

  const deleted = await UserOrganizationMembership.destroy({
    where: { userId, organizationId },
  });
  if (!deleted) {
    throw new NotFoundError("User is not a member of this organisation", {
      code: "MEMBERSHIP_NOT_FOUND",
    });
  }

  logger.info(`[UserService] User ${userId} removed from org ${organizationId}`);
  return { success: true, message: "User removed from organisation" };
}

/**
 * Delete a user account. Since migration 0026 (#930) their authored ideas,
 * comments and votes SURVIVE with a null author/user reference (rendered as
 * "Former member"): content is organisational property and history stays
 * stable. True erasure (delete the user AND purge their authored content)
 * is deliberately not implemented; if a privacy request ever requires it,
 * build it as an explicit named service action with its own confirmation
 * listing exactly what will be destroyed, never as an FK cascade.
 * Guards against self-deletion.
 *
 * @param {{ organizationId: string, user: { id: string } }} ctx
 * @param {string} userId UUID
 * @returns {{ success: true, message: string }}
 */
export async function deleteUser(ctx, userId) {
  if (!isValidUUID(userId)) throw new NotFoundError("User not found", { code: "USER_NOT_FOUND" });

  if (userId === ctx.user.id) {
    throw new ValidationError("Cannot delete your own account", { code: "USER_SELF_DELETE" });
  }

  const user = await User.findByPk(userId);
  if (!user) throw new NotFoundError("User not found", { code: "USER_NOT_FOUND" });

  if (ctx.organizationId && user.organizationId !== ctx.organizationId) {
    throw new ForbiddenError("Cannot delete users from other organisations", {
      code: "CROSS_ORG_FORBIDDEN",
    });
  }

  await user.destroy();
  return { success: true, message: `User ${user.username} deleted successfully` };
}

/**
 * Validate a CSV row array as if it were a bulk import, WITHOUT writing
 * anything. Used by both the preview endpoint (Issue #881) and the confirm
 * endpoint (which re-validates to guard against TOCTOU drift between preview
 * and confirm).
 *
 * Runs:
 *   1. Cap check (#865): per-import size + per-org 30-day total.
 *   2. Per-row format validation: username length, email format, password
 *      length (if provided).
 *   3. Dedup check against the live Users table: username uniqueness + email
 *      uniqueness. These queries run inside the caller's tenant transaction
 *      so RLS posture matches the create phase.
 *
 * Pure (no writes, no email enqueue). Cheap to call twice (preview + confirm).
 *
 * Issue #984: username is optional, matching the #892 one-shape direction
 * (username is a server-generated display name at every other creation
 * site -- /register, /demo-signup, OAuth). When a row supplies a username
 * it is still treated as an explicit display name: the length check and
 * the duplicate-against-live-Users check below are unchanged, and a
 * collision is still rejected rather than silently regenerated. When a row
 * omits it, `accepted[].username` is `null` here -- no candidate is minted
 * during validation (this function runs twice per import, once at preview
 * and once at confirm, and a value chosen here would either falsely
 * promise a specific name to the preview UI or double-generate). The real
 * value is minted by `createUsersFromValidated` at execution time, via the
 * same `findUniqueUsername` helper every other creation site uses.
 *
 * @param {{ organizationId: string, user: { organizationId: string, tenant_id: string } }} ctx
 * @param {{ username?: string, email: string, password?: string, isAdmin?: string }[]} rows
 * @returns {Promise<{
 *   summary: { total: number, wouldCreate: number, wouldSkip: number },
 *   accepted: { row: number, username: string|null, email: string, password: string|null, isAdmin: boolean }[],
 *   rejected: { row: number, field: string, message: string }[],
 * }>}
 */
export async function validateBulkImportRows(ctx, rows) {
  const { organizationId } = ctx;

  if (!organizationId) {
    throw new ForbiddenError(
      "Admin account is missing organisation information. Please contact support.",
      { code: "USER_NO_ORG" }
    );
  }

  // Issue #865 safety caps. Runs BEFORE row processing so an oversized or
  // quota-busting preview surfaces as a single 403 rather than a 400 row
  // result with N false-OK rows above the limit.
  await assertBulkImportWithinCaps({ organizationId, requestedCount: rows.length });

  const accepted = [];
  const rejected = [];
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    if (!row.email || !row.email.trim()) {
      rejected.push({ row: rowNum, field: "email", message: "Email is required" });
      continue;
    }

    // #984: username column is optional. An absent/blank value is not a
    // rejection -- it is carried through as `null` and generated later.
    const rawUsername = row.username?.trim() || "";
    const username = rawUsername || null;
    const email = row.email.trim().toLowerCase();
    const password = row.password?.trim() || null;
    const isAdmin = row.isAdmin === "true" || row.isAdmin === "1" || row.isAdmin === "yes";

    if (username && (username.length < 3 || username.length > 30)) {
      rejected.push({
        row: rowNum,
        field: "username",
        message: "Username must be 3-30 characters",
      });
      continue;
    }
    if (!emailRegex.test(email)) {
      rejected.push({ row: rowNum, field: "email", message: "Invalid email format" });
      continue;
    }
    if (password && password.length < 8) {
      rejected.push({
        row: rowNum,
        field: "password",
        message: "Password must be at least 8 characters",
      });
      continue;
    }

    if (username) {
      const existingUsername = await User.findOne({ where: { username } });
      if (existingUsername) {
        rejected.push({
          row: rowNum,
          field: "username",
          message: `Username '${username}' already exists`,
        });
        continue;
      }
    }

    const existingEmail = await User.findOne({ where: { email } });
    if (existingEmail) {
      rejected.push({ row: rowNum, field: "email", message: `Email '${email}' already exists` });
      continue;
    }

    accepted.push({ row: rowNum, username, email, password, isAdmin });
  }

  const summary = {
    total: rows.length,
    wouldCreate: accepted.length,
    wouldSkip: rejected.length,
  };
  return { summary, accepted, rejected };
}

/**
 * Create users from a pre-validated `accepted` array (output of
 * `validateBulkImportRows`). Enqueues a setup-invite email for any row whose
 * password column was blank.
 *
 * The DB unique constraint on username + email is the final dedup teeth (the
 * preview's findOne checks are advisory, not transactional, so a race between
 * two concurrent confirms collapses to one create + one constraint error).
 *
 * Issue #984: a row with `username: null` (no username column supplied) gets
 * one generated here, via the shared `findUniqueUsername` helper
 * (`routes/oauth.js`) -- the same helper /register, /demo-signup, and the
 * OAuth callback use, so bulk-imported accounts land on the identical
 * sanitise + collision-retry behaviour as every other creation site. Rows
 * are processed sequentially (not in parallel), so two rows in the same
 * import that both omit a username still land on distinct names: each
 * `findUniqueUsername` call re-queries the live Users table, and by the
 * time the next row runs, the previous row's `User.create` has already
 * committed.
 *
 * `oauth.js` is a route module (`routes/`), not a service; it is imported
 * dynamically here rather than statically, mirroring the exact pattern
 * `routes/auth.js` already uses for the same helper (`await
 * import("./oauth.js")` inside the handler, not a top-level import). This
 * sidesteps a real load-order hazard: `oauth.js` imports
 * `middleware/auth.js`, which is one of the things that mounts route
 * modules during app bootstrap, so a static top-level
 * `userService.js -> oauth.js` edge risks a circular-import cycle the
 * moment any route module imports this service before `oauth.js` finishes
 * initialising. The dynamic import defers resolution until the function
 * actually runs, after the whole module graph is loaded.
 *
 * @param {{ organizationId: string, user: { organizationId: string, tenant_id: string } }} ctx
 * @param {{ row: number, username: string|null, email: string, password: string|null, isAdmin: boolean }[]} acceptedRows
 * @returns {Promise<{ results: object[], errors: object[] }>}
 */
async function createUsersFromValidated(ctx, acceptedRows) {
  const { organizationId, user } = ctx;
  const results = [];
  const errors = [];
  let inviteIndex = 0;
  const baseScheduleTime = new Date();

  const needsGeneratedUsername = acceptedRows.some((row) => !row.username);
  const { findUniqueUsername } = needsGeneratedUsername
    ? await import("../routes/oauth.js")
    : { findUniqueUsername: null };

  for (const acceptedRow of acceptedRows) {
    const { row: rowNum, email, password, isAdmin } = acceptedRow;
    try {
      // #984: generate a username now, immediately before create, so the
      // uniqueness check below is as fresh as possible against concurrent
      // rows/imports.
      const username = acceptedRow.username || (await findUniqueUsername(null, email));

      // If no password supplied, lock the account and send a setup invite.
      const passwordHash = password
        ? await hashPassword(password)
        : await hashPassword(crypto.randomBytes(32).toString("hex"));

      const newUser = await User.create({
        username,
        email,
        passwordHash,
        isAdmin,
        isAnonymous: false,
        organizationId,
        tenant_id: user.tenant_id,
      });

      if (!password) {
        try {
          // Issue #865: bulk-imported invites go via BATCH priority with
          // scheduledFor staggered so a single import cannot consume more
          // than (1 - EMAIL_BULK_RESERVE_FRACTION) of the Resend hourly
          // budget, protecting password-reset / billing / auth email
          // (#735 incident class).
          await triggerAccountSetup(newUser, {
            priority: EmailPriority.BATCH,
            scheduledFor: scheduledForBulkInvite(inviteIndex, baseScheduleTime),
          });
          inviteIndex += 1;
        } catch (emailErr) {
          logger.error(
            `[UserService:bulkImport] Setup email failed for ${email}:`,
            emailErr.message
          );
        }
      }

      results.push({
        row: rowNum,
        username: newUser.username,
        email: newUser.email,
        isAdmin: newUser.isAdmin,
        setupEmailSent: !password,
        success: true,
      });
    } catch (error) {
      logger.error(`[UserService:bulkImport] Error processing row ${rowNum}:`, error);
      errors.push({ row: rowNum, field: "general", message: error.message || "Unknown error" });
    }
  }

  return { results, errors };
}

/**
 * Preview a bulk import (Issue #881 step 1 of 2). Validates the CSV, returns
 * a dry-run summary plus a signed `previewToken` bound to the uploader,
 * organisation, and SHA-256 hash of the file. No users created, no emails
 * enqueued. The previewToken is required by `confirmBulkImport` for the
 * actual write phase.
 *
 * Issue #984: `accepted[].username` is `null` for a row that omitted the
 * username column -- no username is generated at preview time. The caller
 * (UI) should render that as "(auto-generated)"; the real value is only
 * decided when `confirmBulkImport` -> `createUsersFromValidated` runs, so a
 * name shown here would be a promise the confirm pass might not keep.
 *
 * @param {{ organizationId: string, user: object }} ctx
 * @param {Buffer} fileBuffer Raw CSV bytes (for the file-hash binding).
 * @param {object[]} rows     Parsed CSV row objects (from csv-parser).
 * @returns {Promise<{
 *   summary: object,
 *   accepted: object[],
 *   rejected: object[],
 *   previewToken: string|null,
 *   fileHash: string,
 * }>}
 */
export async function previewBulkImport(ctx, fileBuffer, rows) {
  const { organizationId, user } = ctx;
  const { summary, accepted, rejected } = await validateBulkImportRows(ctx, rows);
  const fileHash = hashFileBuffer(fileBuffer);

  // Only sign a token if at least one row would be created. A preview with
  // zero accepted rows is information-only; there is nothing to confirm.
  const previewToken =
    accepted.length > 0
      ? signPreviewToken({
          userId: user.id,
          organizationId,
          fileHash,
          acceptedCount: accepted.length,
        })
      : null;

  // Strip plaintext passwords from the response. The admin already has the
  // values (they uploaded the CSV), but echoing them back via res.json
  // lands them in browser dev-tools, response-body-capturing error
  // monitors, HAR exports, and any access logs that record bodies. Confirm
  // re-parses the file, so the preview does not need to carry them forward.
  // Surfaced by session-end code review on 2026-05-20 against PR #890.
  const acceptedSanitised = accepted.map(({ password, ...rest }) => ({
    ...rest,
    hasPassword: !!password,
  }));

  return { summary, accepted: acceptedSanitised, rejected, previewToken, fileHash };
}

/**
 * Confirm a bulk import (Issue #881 step 2 of 2). Verifies the previewToken
 * binds to the current uploader, org, and CSV file, then re-runs validation
 * (to guard against TOCTOU drift: a user could have been created in the
 * interval between preview and confirm) and creates the still-accepted rows.
 *
 * Re-running validation matters: if a username became taken between preview
 * and confirm, the confirm honours the new state and drops that row.
 *
 * @param {{ organizationId: string, user: object }} ctx
 * @param {Buffer} fileBuffer       Raw CSV bytes (must match preview-time hash).
 * @param {object[]} rows           Parsed CSV row objects.
 * @param {string} previewToken     JWT from the preview step.
 * @returns {Promise<{ success: boolean, summary: object, results: object[], errors: object[] }>}
 */
export async function confirmBulkImport(ctx, fileBuffer, rows, previewToken) {
  const { organizationId, user } = ctx;
  const fileHash = hashFileBuffer(fileBuffer);

  // Throws ValidationError (400) on any token mismatch or expiry.
  verifyPreviewToken(previewToken, {
    userId: user.id,
    organizationId,
    fileHash,
  });

  // Re-validate at confirm time. The previewToken proves the file is the same
  // bytes, but the Users table state can drift between preview and confirm
  // (someone else's flow might create a user the preview said was available).
  const { summary: validateSummary, accepted, rejected } = await validateBulkImportRows(ctx, rows);

  const { results, errors } = await createUsersFromValidated(ctx, accepted);

  // Pre-existing rejections (format/dedup at validate time) are surfaced
  // alongside the create-time errors so the admin sees the complete picture
  // of what happened versus what they previewed.
  const allErrors = [...rejected, ...errors];
  const summary = {
    total: validateSummary.total,
    successful: results.length,
    failed: allErrors.length,
  };
  logger.info("[UserService:bulkImport] Confirm summary:", summary);

  return { success: true, summary, results, errors: allErrors };
}
