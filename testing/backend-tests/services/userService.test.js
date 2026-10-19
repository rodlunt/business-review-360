/**
 * Issue #485, Phase 4 — UserService unit tests.
 *
 * Tests service functions directly without HTTP scaffolding.
 * Uses SQLite in-memory.
 *
 * Coverage:
 *   - listUsers: org-scoped
 *   - setAdminFlag: cross-org guard, not-found
 *   - updateUserEmail: validation, conflict, cross-org guard
 *   - approveUser: already-approved guard, cross-org guard
 *   - deleteUser: self-delete guard, cross-org guard
 *   - bulkImportFromCsv: validation errors, successful import
 */
import { describe, it, expect, beforeAll, afterAll, jest } from "@jest/globals";

import User from "../../../backend/src/models/User.js";

const Sequelize = User.sequelize.constructor;

// Hoisted mock for sendTeamInviteEmail so #865 tests below can inspect call args
// (BATCH priority + scheduledFor stagger).
const sendTeamInviteEmailMock = jest.fn(() => Promise.resolve());

jest.unstable_mockModule("../../../backend/src/services/notificationEmailService.js", () => ({
  sendPasswordResetEmail: jest.fn(() => Promise.resolve()),
  sendAccountSetupEmail: jest.fn(() => Promise.resolve()),
  sendUserAccountApprovedEmail: jest.fn(() => Promise.resolve()),
  sendTeamInviteEmail: sendTeamInviteEmailMock,
}));

jest.unstable_mockModule("../../../backend/src/models/Organization.js", () => ({
  default: { findOne: jest.fn(() => Promise.resolve(null)) },
}));

const mockUOM = {
  findAll: jest.fn(() => Promise.resolve([])),
  findOne: jest.fn(() => Promise.resolve(null)),
  create: jest.fn(() => Promise.resolve({})),
  update: jest.fn(() => Promise.resolve([1])),
  destroy: jest.fn(() => Promise.resolve(0)),
};

jest.unstable_mockModule("../../../backend/src/models/UserOrganizationMembership.js", () => ({
  default: mockUOM,
}));

const {
  listUsers,
  setAdminFlag,
  updateUserEmail,
  approveUser,
  deleteUser,
  validateBulkImportRows,
  previewBulkImport,
  confirmBulkImport,
} = await import("../../../backend/src/services/userService.js");

const { ValidationError, NotFoundError, ForbiddenError, ConflictError } =
  await import("../../../backend/src/services/errors.js");

const { EmailPriority } = await import("../../../backend/src/services/emailPriority.js");

// ── Harness setup ──────────────────────────────────────────────────────────

const ORG_A = "svc-org-alpha";
const ORG_B = "svc-org-beta";
const TENANT_A = "22222222-2222-2222-2222-222222222222";

let sequelize;
let adminUser;
let regularUser;
let otherOrgUser;

beforeAll(async () => {
  sequelize = new Sequelize({ dialect: "sqlite", storage: ":memory:", logging: false });

  User.init(
    {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
      username: { type: Sequelize.STRING, unique: true },
      email: { type: Sequelize.STRING, unique: true },
      passwordHash: Sequelize.STRING,
      isAdmin: { type: Sequelize.BOOLEAN, defaultValue: false },
      isAnonymous: { type: Sequelize.BOOLEAN, defaultValue: false },
      isApproved: { type: Sequelize.BOOLEAN, defaultValue: true },
      organizationId: Sequelize.STRING,
      tenant_id: Sequelize.UUID,
      passwordResetToken: Sequelize.STRING,
      passwordResetExpires: Sequelize.DATE,
    },
    { sequelize, modelName: "User", tableName: "Users" }
  );

  await sequelize.sync({ force: true });

  adminUser = await User.create({
    username: "svc-admin",
    email: "admin@svc-alpha.test",
    passwordHash: "x",
    isAdmin: true,
    organizationId: ORG_A,
    tenant_id: TENANT_A,
  });

  regularUser = await User.create({
    username: "svc-regular",
    email: "regular@svc-alpha.test",
    passwordHash: "x",
    isAdmin: false,
    organizationId: ORG_A,
    tenant_id: TENANT_A,
  });

  otherOrgUser = await User.create({
    username: "svc-other",
    email: "other@svc-beta.test",
    passwordHash: "x",
    isAdmin: false,
    organizationId: ORG_B,
    tenant_id: TENANT_A,
  });

  // Wire membership mock to return ORG_A members after users are created
  mockUOM.findAll.mockImplementation(({ where } = {}) => {
    const orgId = where?.organizationId;
    if (orgId === ORG_A) {
      return Promise.resolve([
        { userId: adminUser.id, isAdmin: true, isSuperuser: false, isApproved: true },
        { userId: regularUser.id, isAdmin: false, isSuperuser: false, isApproved: true },
      ]);
    }
    return Promise.resolve([]);
  });
});

afterAll(async () => {
  await sequelize.close();
});

// ── listUsers ──────────────────────────────────────────────────────────────

describe("listUsers", () => {
  it("returns only users from the specified org", async () => {
    const users = await listUsers({ organizationId: ORG_A });
    const orgIds = [...new Set(users.map((u) => u.organizationId))];
    expect(orgIds).toEqual([ORG_A]);
  });

  it("throws ForbiddenError when organizationId is null", async () => {
    await expect(listUsers({ organizationId: null })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

// ── setAdminFlag ───────────────────────────────────────────────────────────

describe("setAdminFlag", () => {
  it("promotes a user to admin", async () => {
    const result = await setAdminFlag(
      { organizationId: ORG_A, user: adminUser },
      regularUser.id,
      true
    );
    expect(result.success).toBe(true);
    const reloaded = await User.findByPk(regularUser.id);
    expect(reloaded.isAdmin).toBe(true);
    // Restore
    await setAdminFlag({ organizationId: ORG_A, user: adminUser }, regularUser.id, false);
  });

  it("throws ForbiddenError for cross-org modification", async () => {
    await expect(
      setAdminFlag({ organizationId: ORG_A, user: adminUser }, otherOrgUser.id, true)
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("throws NotFoundError for non-existent user", async () => {
    await expect(
      setAdminFlag(
        { organizationId: ORG_A, user: adminUser },
        "00000000-0000-0000-0000-000000000099",
        true
      )
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws NotFoundError for invalid UUID", async () => {
    await expect(
      setAdminFlag({ organizationId: ORG_A, user: adminUser }, "not-a-uuid", true)
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ── updateUserEmail ────────────────────────────────────────────────────────

describe("updateUserEmail", () => {
  it("updates the email address", async () => {
    const result = await updateUserEmail(
      { organizationId: ORG_A },
      regularUser.id,
      "new@svc-alpha.test"
    );
    expect(result.success).toBe(true);
    expect(result.user.email).toBe("new@svc-alpha.test");
    // Restore
    await updateUserEmail({ organizationId: ORG_A }, regularUser.id, "regular@svc-alpha.test");
  });

  it("throws ValidationError for missing email", async () => {
    await expect(
      updateUserEmail({ organizationId: ORG_A }, regularUser.id, "")
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ValidationError for malformed email", async () => {
    await expect(
      updateUserEmail({ organizationId: ORG_A }, regularUser.id, "notanemail")
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ConflictError when email is already in use", async () => {
    await expect(
      updateUserEmail({ organizationId: ORG_A }, regularUser.id, "admin@svc-alpha.test")
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("throws ForbiddenError for cross-org modification", async () => {
    await expect(
      updateUserEmail({ organizationId: ORG_A }, otherOrgUser.id, "x@svc-alpha.test")
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

// ── approveUser ────────────────────────────────────────────────────────────

describe("approveUser", () => {
  let pendingUser;

  beforeAll(async () => {
    pendingUser = await User.create({
      username: "svc-pending",
      email: "pending@svc-alpha.test",
      passwordHash: "x",
      isAdmin: false,
      isApproved: false,
      organizationId: ORG_A,
      tenant_id: TENANT_A,
    });
  });

  it("approves a pending user", async () => {
    const result = await approveUser({ organizationId: ORG_A }, pendingUser.id);
    expect(result.success).toBe(true);
    expect(result.user.isApproved).toBe(true);
  });

  it("throws ValidationError when already approved", async () => {
    await expect(approveUser({ organizationId: ORG_A }, pendingUser.id)).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  it("throws ForbiddenError for cross-org approval", async () => {
    await expect(approveUser({ organizationId: ORG_A }, otherOrgUser.id)).rejects.toBeInstanceOf(
      ForbiddenError
    );
  });
});

// ── deleteUser ─────────────────────────────────────────────────────────────

describe("deleteUser", () => {
  it("deletes a user", async () => {
    const toDelete = await User.create({
      username: "svc-todelete",
      email: "todelete@svc-alpha.test",
      passwordHash: "x",
      organizationId: ORG_A,
      tenant_id: TENANT_A,
    });

    const result = await deleteUser(
      { organizationId: ORG_A, user: { id: adminUser.id } },
      toDelete.id
    );
    expect(result.success).toBe(true);
    expect(await User.findByPk(toDelete.id)).toBeNull();
  });

  it("throws ValidationError on self-deletion", async () => {
    await expect(
      deleteUser({ organizationId: ORG_A, user: { id: adminUser.id } }, adminUser.id)
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ForbiddenError for cross-org deletion", async () => {
    await expect(
      deleteUser({ organizationId: ORG_A, user: { id: adminUser.id } }, otherOrgUser.id)
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

// ── validateBulkImportRows / previewBulkImport / confirmBulkImport ────────
//
// Issue #881 superseded the single-shot `bulkImportFromCsv` with a 2-step
// preview-then-confirm flow. These tests cover the underlying validation,
// the preview-side token shape, and the confirm full flow (token in,
// users created, BATCH priority on invite enqueue).

const CSV_BUFFER = Buffer.from("dummy-csv-bytes-for-hash-binding");

describe("validateBulkImportRows", () => {
  it("accepts a valid row (dry run; no users created)", async () => {
    const ctx = { organizationId: ORG_A, user: { id: adminUser.id, tenant_id: TENANT_A } };
    const rows = [
      { username: "vbulkuser1", email: "vbulkuser1@svc-alpha.test", password: "Password123" },
    ];
    const result = await validateBulkImportRows(ctx, rows);
    expect(result.summary.wouldCreate).toBe(1);
    expect(result.summary.wouldSkip).toBe(0);
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0].username).toBe("vbulkuser1");
    // No write side effects: the live User table should still not contain it.
    const dbHit = await User.findOne({ where: { username: "vbulkuser1" } });
    expect(dbHit).toBeNull();
  });

  // Issue #984: username is no longer required. Since #892, username is a
  // server-generated display name at every other creation site (/register,
  // /demo-signup, OAuth) -- the bulk-import path used to be the one holdout
  // that still rejected a row for omitting it.
  it("accepts a row with a missing username, carrying username: null through for later generation", async () => {
    const ctx = { organizationId: ORG_A, user: { id: adminUser.id, tenant_id: TENANT_A } };
    const rows = [{ username: "", email: "no-username@svc-alpha.test", password: "Password123" }];
    const result = await validateBulkImportRows(ctx, rows);
    expect(result.summary.wouldSkip).toBe(0);
    expect(result.summary.wouldCreate).toBe(1);
    expect(result.accepted[0].username).toBeNull();
    expect(result.accepted[0].email).toBe("no-username@svc-alpha.test");
  });

  it("rejects missing email (still required; unaffected by #984)", async () => {
    const ctx = { organizationId: ORG_A, user: { id: adminUser.id, tenant_id: TENANT_A } };
    const rows = [{ username: "vsomeuser", email: "", password: "Password123" }];
    const result = await validateBulkImportRows(ctx, rows);
    expect(result.summary.wouldSkip).toBe(1);
    expect(result.rejected[0].field).toBe("email");
    expect(result.rejected[0].message).toBe("Email is required");
  });

  it("rejects short password", async () => {
    const ctx = { organizationId: ORG_A, user: { id: adminUser.id, tenant_id: TENANT_A } };
    const rows = [{ username: "vbadpwuser", email: "vbadpw@svc-alpha.test", password: "short" }];
    const result = await validateBulkImportRows(ctx, rows);
    expect(result.summary.wouldSkip).toBe(1);
    expect(result.rejected[0].field).toBe("password");
  });

  it("rejects an explicit username that fails the 3-30 length check", async () => {
    const ctx = { organizationId: ORG_A, user: { id: adminUser.id, tenant_id: TENANT_A } };
    const rows = [{ username: "ab", email: "vshortname@svc-alpha.test", password: "Password123" }];
    const result = await validateBulkImportRows(ctx, rows);
    expect(result.summary.wouldSkip).toBe(1);
    expect(result.rejected[0].field).toBe("username");
    expect(result.rejected[0].message).toBe("Username must be 3-30 characters");
  });

  it("rejects duplicate username (live Users table check) when username IS provided", async () => {
    const ctx = { organizationId: ORG_A, user: { id: adminUser.id, tenant_id: TENANT_A } };
    const rows = [
      { username: "svc-admin", email: "notadmin@svc-alpha.test", password: "Password123" },
    ];
    const result = await validateBulkImportRows(ctx, rows);
    expect(result.summary.wouldSkip).toBe(1);
    expect(result.rejected[0].message).toMatch(/already exists/);
  });

  it("throws ForbiddenError when ctx has no organizationId", async () => {
    await expect(
      validateBulkImportRows(
        { organizationId: null, user: { id: adminUser.id, tenant_id: TENANT_A } },
        []
      )
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("previewBulkImport", () => {
  it("returns summary + token for accepted rows; no users created", async () => {
    const ctx = { organizationId: ORG_A, user: { id: adminUser.id, tenant_id: TENANT_A } };
    const rows = [
      { username: "pbulkuser1", email: "pbulkuser1@svc-alpha.test", password: "Password123" },
    ];
    const result = await previewBulkImport(ctx, CSV_BUFFER, rows);
    expect(result.summary.wouldCreate).toBe(1);
    expect(result.previewToken).toEqual(expect.any(String));
    expect(result.fileHash).toMatch(/^[a-f0-9]{64}$/);
    // No write side effects.
    const dbHit = await User.findOne({ where: { username: "pbulkuser1" } });
    expect(dbHit).toBeNull();
  });

  it("returns previewToken=null when no rows pass validation", async () => {
    const ctx = { organizationId: ORG_A, user: { id: adminUser.id, tenant_id: TENANT_A } };
    const rows = [{ username: "", email: "", password: "Password123" }];
    const result = await previewBulkImport(ctx, CSV_BUFFER, rows);
    expect(result.summary.wouldCreate).toBe(0);
    expect(result.previewToken).toBeNull();
  });

  // #984: a row with no username is still ACCEPTED at preview time (the
  // username is generated later, at confirm). The preview response must not
  // promise a specific value it cannot guarantee.
  it("accepted rows with no username surface as username: null, not a minted value", async () => {
    const ctx = { organizationId: ORG_A, user: { id: adminUser.id, tenant_id: TENANT_A } };
    const rows = [
      { username: "", email: "pnousername@svc-alpha.test", password: "Password123" },
    ];
    const result = await previewBulkImport(ctx, CSV_BUFFER, rows);
    expect(result.summary.wouldCreate).toBe(1);
    expect(result.accepted[0].username).toBeNull();
    expect(result.previewToken).toEqual(expect.any(String));
    // No write side effects, same invariant as every other preview test.
    const dbHit = await User.findOne({ where: { email: "pnousername@svc-alpha.test" } });
    expect(dbHit).toBeNull();
  });

  // Session-end review 2026-05-20 surfaced PR #890 returning the plaintext
  // CSV passwords in the response body. The admin already has them, but
  // the round-trip landed them in browser dev-tools + any access logs that
  // record bodies. Strip them; surface only a boolean.
  it("strips plaintext password from accepted rows; surfaces hasPassword boolean", async () => {
    const ctx = { organizationId: ORG_A, user: { id: adminUser.id, tenant_id: TENANT_A } };
    const rows = [
      { username: "pSecBulk1", email: "psecbulk1@svc-alpha.test", password: "Password123" },
      { username: "pSecBulk2", email: "psecbulk2@svc-alpha.test" }, // no password column
    ];
    const result = await previewBulkImport(ctx, CSV_BUFFER, rows);
    expect(result.summary.wouldCreate).toBe(2);
    for (const row of result.accepted) {
      expect(row).not.toHaveProperty("password");
      expect(row).toHaveProperty("hasPassword");
    }
    const passwordRow = result.accepted.find((r) => r.username === "pSecBulk1");
    const noPasswordRow = result.accepted.find((r) => r.username === "pSecBulk2");
    expect(passwordRow.hasPassword).toBe(true);
    expect(noPasswordRow.hasPassword).toBe(false);
    // Belt + braces: the entire JSON-serialised response must not contain
    // the literal password value anywhere.
    expect(JSON.stringify(result)).not.toContain("Password123");
  });
});

describe("confirmBulkImport", () => {
  // Issue #865 — bulk invites must go via BATCH priority + scheduledFor stagger
  // so a single import cannot starve the shared Resend quota.
  it("creates accepted users and enqueues invites with BATCH priority", async () => {
    sendTeamInviteEmailMock.mockClear();
    const ctx = { organizationId: ORG_A, user: { id: adminUser.id, tenant_id: TENANT_A } };
    const rows = [
      { username: "cNoPwUser1", email: "cnopw1@svc-alpha.test" },
      { username: "cNoPwUser2", email: "cnopw2@svc-alpha.test" },
    ];
    const preview = await previewBulkImport(ctx, CSV_BUFFER, rows);
    const result = await confirmBulkImport(ctx, CSV_BUFFER, rows, preview.previewToken);

    expect(result.summary.successful).toBe(2);
    expect(sendTeamInviteEmailMock).toHaveBeenCalledTimes(2);
    // Signature: (to, userName, token, organizationId, organization, opts)
    const firstOpts = sendTeamInviteEmailMock.mock.calls[0][5];
    const secondOpts = sendTeamInviteEmailMock.mock.calls[1][5];
    expect(firstOpts.priority).toBe(EmailPriority.BATCH);
    expect(secondOpts.priority).toBe(EmailPriority.BATCH);
    expect(firstOpts.scheduledFor).toBeInstanceOf(Date);
    expect(secondOpts.scheduledFor).toBeInstanceOf(Date);
    expect(firstOpts.scheduledFor.getTime()).toBe(secondOpts.scheduledFor.getTime());
  });

  it("rows with password skip the invite email entirely", async () => {
    sendTeamInviteEmailMock.mockClear();
    const ctx = { organizationId: ORG_A, user: { id: adminUser.id, tenant_id: TENANT_A } };
    const rows = [
      { username: "cWithPwUser", email: "cwithpw@svc-alpha.test", password: "Password123" },
    ];
    const preview = await previewBulkImport(ctx, CSV_BUFFER, rows);
    await confirmBulkImport(ctx, CSV_BUFFER, rows, preview.previewToken);
    expect(sendTeamInviteEmailMock).not.toHaveBeenCalled();
  });

  it("rejects a forged token (bad signature)", async () => {
    const ctx = { organizationId: ORG_A, user: { id: adminUser.id, tenant_id: TENANT_A } };
    const rows = [
      { username: "cForgedUser", email: "cforged@svc-alpha.test", password: "Password123" },
    ];
    const forged = "eyJhbGciOiJIUzI1NiJ9.eyJ0eXBlIjoiYnVsay1pbXBvcnQtcHJldmlldyJ9.bad-signature";
    await expect(confirmBulkImport(ctx, CSV_BUFFER, rows, forged)).rejects.toMatchObject({
      code: "PREVIEW_TOKEN_INVALID",
    });
  });

  it("rejects a token whose file hash does not match the confirm-side file", async () => {
    const ctx = { organizationId: ORG_A, user: { id: adminUser.id, tenant_id: TENANT_A } };
    const rows = [
      { username: "cFileMismatch", email: "cfilemismatch@svc-alpha.test", password: "Password123" },
    ];
    const preview = await previewBulkImport(ctx, CSV_BUFFER, rows);
    const differentBytes = Buffer.from("a-different-csv-payload");
    await expect(
      confirmBulkImport(ctx, differentBytes, rows, preview.previewToken)
    ).rejects.toMatchObject({ code: "PREVIEW_TOKEN_FILE_MISMATCH" });
  });

  it("re-running confirm with the same file is a no-op on the second pass (dedup as replay defence)", async () => {
    const ctx = { organizationId: ORG_A, user: { id: adminUser.id, tenant_id: TENANT_A } };
    const rows = [
      { username: "cReplayUser", email: "creplay@svc-alpha.test", password: "Password123" },
    ];
    const preview = await previewBulkImport(ctx, CSV_BUFFER, rows);

    const first = await confirmBulkImport(ctx, CSV_BUFFER, rows, preview.previewToken);
    expect(first.summary.successful).toBe(1);

    const second = await confirmBulkImport(ctx, CSV_BUFFER, rows, preview.previewToken);
    expect(second.summary.successful).toBe(0);
    expect(second.summary.failed).toBe(1);
    expect(second.errors[0].message).toMatch(/already exists/);
  });

  // Issue #984: a row with no username column gets one generated at confirm
  // time via the shared findUniqueUsername helper (same one /register,
  // /demo-signup, and OAuth use). findByPk assertions are unsafe under the
  // SQLite test harness spy pattern (see CLAUDE.md); use findOne directly
  // against the DB as this repo's convention requires.
  it("generates a unique username for a row with no username, and persists it", async () => {
    const ctx = { organizationId: ORG_A, user: { id: adminUser.id, tenant_id: TENANT_A } };
    const rows = [{ email: "cgenusername@svc-alpha.test", password: "Password123" }];
    const preview = await previewBulkImport(ctx, CSV_BUFFER, rows);
    expect(preview.accepted[0].username).toBeNull();

    const result = await confirmBulkImport(ctx, CSV_BUFFER, rows, preview.previewToken);
    expect(result.summary.successful).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(result.results[0].username).toEqual(expect.any(String));
    expect(result.results[0].username.length).toBeGreaterThanOrEqual(3);

    const dbHit = await User.findOne({ where: { email: "cgenusername@svc-alpha.test" } });
    expect(dbHit).not.toBeNull();
    expect(dbHit.username).toBe(result.results[0].username);
  });

  it("keeps an explicit username as-is when the row supplies one", async () => {
    const ctx = { organizationId: ORG_A, user: { id: adminUser.id, tenant_id: TENANT_A } };
    const rows = [
      { username: "cExplicitName", email: "cexplicit@svc-alpha.test", password: "Password123" },
    ];
    const preview = await previewBulkImport(ctx, CSV_BUFFER, rows);
    expect(preview.accepted[0].username).toBe("cExplicitName");

    const result = await confirmBulkImport(ctx, CSV_BUFFER, rows, preview.previewToken);
    expect(result.results[0].username).toBe("cExplicitName");

    const dbHit = await User.findOne({ where: { email: "cexplicit@svc-alpha.test" } });
    expect(dbHit.username).toBe("cExplicitName");
  });

  it("two rows sharing an absent username but different emails both get unique generated names", async () => {
    const ctx = { organizationId: ORG_A, user: { id: adminUser.id, tenant_id: TENANT_A } };
    const rows = [
      { email: "cdualgen.one@svc-alpha.test", password: "Password123" },
      { email: "cdualgen.two@svc-alpha.test", password: "Password123" },
    ];
    const preview = await previewBulkImport(ctx, CSV_BUFFER, rows);
    expect(preview.accepted[0].username).toBeNull();
    expect(preview.accepted[1].username).toBeNull();

    const result = await confirmBulkImport(ctx, CSV_BUFFER, rows, preview.previewToken);
    expect(result.summary.successful).toBe(2);
    expect(result.errors).toHaveLength(0);

    const [first, second] = result.results;
    expect(first.username).not.toBe(second.username);

    const dbFirst = await User.findOne({ where: { email: "cdualgen.one@svc-alpha.test" } });
    const dbSecond = await User.findOne({ where: { email: "cdualgen.two@svc-alpha.test" } });
    expect(dbFirst.username).toBe(first.username);
    expect(dbSecond.username).toBe(second.username);
    expect(dbFirst.username).not.toBe(dbSecond.username);
  });
});
