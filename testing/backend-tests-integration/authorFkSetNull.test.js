/**
 * Issue #930 -- deleting a user must NOT cascade away the organisation's
 * review content. Migration 0026 converts the author/user FKs on Ideas,
 * Comments, Votes and CommentVotes to ON DELETE SET NULL.
 *
 * Control: against the pre-0026 schema (ON DELETE CASCADE) every survival
 * assertion here fails, because the DELETE takes the idea, the OTHER
 * user's comment thread and both votes with it. Real Postgres via
 * Testcontainers because FK referential actions are exactly the class
 * SQLite unit mocks cannot exercise.
 */

import { describe, it, expect, beforeAll } from "@jest/globals";
import { getTestSequelize } from "../test-fixtures/postgres-rls-fixture.js";

const sequelize = getTestSequelize();

const tenantId = "55555555-5555-5555-5555-555555559300";
const orgHandle = "demo-corp-930";
const departingId = "93000000-0000-0000-0000-000000000001";
const remainingId = "93000000-0000-0000-0000-000000000002";
const ideaId = "93000000-0000-0000-0000-000000000010";
const commentId = "93000000-0000-0000-0000-000000000020";

async function inTenantTx(fn) {
  return sequelize.transaction(async (t) => {
    await sequelize.query(`SET LOCAL app.tenant_id = :tid`, {
      replacements: { tid: tenantId },
      transaction: t,
    });
    return fn(t);
  });
}

beforeAll(async () => {
  await sequelize.query(
    `INSERT INTO "Organizations" (id, "organizationId", "organizationName", "createdAt", "updatedAt")
     VALUES (gen_random_uuid(), :handle, :handle, NOW(), NOW())
     ON CONFLICT ("organizationId") DO NOTHING`,
    { replacements: { handle: orgHandle } }
  );

  await inTenantTx(async (t) => {
    for (const [uid, uname] of [
      [departingId, "departing-930"],
      [remainingId, "remaining-930"],
    ]) {
      await sequelize.query(
        `INSERT INTO "Users" (id, username, "passwordHash", "isAdmin", "isAnonymous", "isApproved", "organizationId", "tenant_id", "createdAt", "updatedAt")
         VALUES (:uid, :uname, 'x', false, false, true, :org, :tid, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        { replacements: { uid, uname, org: orgHandle, tid: tenantId }, transaction: t }
      );
    }
    // The departing user's idea...
    await sequelize.query(
      `INSERT INTO "Ideas" (id, title, description, "organizationId", "tenant_id", "authorId", "createdAt", "updatedAt")
       VALUES (:ideaId, 'Survivor idea', 'Content outlives its author (#930).', :org, :tid, :author, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      {
        replacements: { ideaId, org: orgHandle, tid: tenantId, author: departingId },
        transaction: t,
      }
    );
    // ...the REMAINING user's comment on it (pre-0026, this died via the
    // idea cascade even though its author was never deleted)...
    await sequelize.query(
      `INSERT INTO "Comments" (id, content, "authorId", "ideaId", "organizationId", "tenant_id", "createdAt", "updatedAt")
       VALUES (:commentId, 'A colleague reply', :author, :ideaId, :org, :tid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      {
        replacements: { commentId, author: remainingId, ideaId, org: orgHandle, tid: tenantId },
        transaction: t,
      }
    );
    // ...and one vote from each user.
    for (const voter of [departingId, remainingId]) {
      await sequelize.query(
        `INSERT INTO "Votes" (id, value, "userId", "ideaId", "tenant_id", "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), 1, :voter, :ideaId, :tid, NOW(), NOW())
         ON CONFLICT DO NOTHING`,
        { replacements: { voter, ideaId, tid: tenantId }, transaction: t }
      );
    }
  });
}, 60000);

describe("Issue #930 -- author FKs are SET NULL, content survives deletion", () => {
  it("deleting the author leaves the idea, the colleague's comment and both votes in place", async () => {
    await inTenantTx((t) =>
      sequelize.query(`DELETE FROM "Users" WHERE id = :uid`, {
        replacements: { uid: departingId },
        transaction: t,
      })
    );

    const [[idea]] = await inTenantTx((t) =>
      sequelize.query(`SELECT id, "authorId", title FROM "Ideas" WHERE id = :ideaId`, {
        replacements: { ideaId },
        transaction: t,
      })
    );
    expect(idea).toBeDefined();
    expect(idea.authorId).toBeNull();
    expect(idea.title).toBe("Survivor idea");

    const [[comment]] = await inTenantTx((t) =>
      sequelize.query(`SELECT id, "authorId" FROM "Comments" WHERE id = :commentId`, {
        replacements: { commentId },
        transaction: t,
      })
    );
    expect(comment).toBeDefined();
    // The colleague still owns their comment; only the departed author nulls.
    expect(comment.authorId).toBe(remainingId);

    const [votes] = await inTenantTx((t) =>
      sequelize.query(
        `SELECT "userId" FROM "Votes" WHERE "ideaId" = :ideaId ORDER BY "userId" NULLS FIRST`,
        {
          replacements: { ideaId },
          transaction: t,
        }
      )
    );
    expect(votes).toHaveLength(2);
    expect(votes[0].userId).toBeNull();
    expect(votes[1].userId).toBe(remainingId);
  });

  it("the departed author's user row is genuinely gone", async () => {
    const [rows] = await inTenantTx((t) =>
      sequelize.query(`SELECT id FROM "Users" WHERE id = :uid`, {
        replacements: { uid: departingId },
        transaction: t,
      })
    );
    expect(rows).toHaveLength(0);
  });
});
