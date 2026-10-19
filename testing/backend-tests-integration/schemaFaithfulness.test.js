// Phase 4 prerequisite: prove the integration fixture now loads the
// canonical db/migrations/app/ schema, not the frozen legacy
// db/clean_minimal_schema.sql. The legacy file predates migration 0008, so
// before this change a Testcontainers test could not see isSuperuser,
// hasSeen*Walkthrough, primaryOrganizationId, etc. and any seed/assert on
// them failed with `column "..." does not exist`. This guard fails if the
// fixture ever regresses to the legacy schema.
import { describe, it, expect, afterAll } from "@jest/globals";
import { getTestSequelize } from "../test-fixtures/postgres-rls-fixture.js";

const POST_0008_USER_COLUMNS = [
  "isSuperuser", // 0008
  "hasSeenSuperuserWalkthrough", // 0009
  "hasSeenAdminWalkthrough", // 0009
  "hasSeenUserWalkthrough", // 0009
  "primaryOrganizationId", // 0020
  "referredByConsultantCode", // 0021
  "referralCapturedAt", // 0021
];

describe("integration fixture loads the canonical migrated schema", () => {
  it("recorded every db/migrations/app migration in schema_migrations", async () => {
    const sequelize = getTestSequelize();
    const [rows] = await sequelize.query(
      "SELECT COUNT(*)::int AS n FROM schema_migrations WHERE filename LIKE '00%-%.sql'"
    );
    // 21 migration files at time of writing; assert the runner applied the
    // full ordered set rather than a single legacy dump (which records none).
    expect(rows[0].n).toBeGreaterThanOrEqual(21);
  });

  it("exposes the post-0008 Users columns the legacy schema lacked", async () => {
    const sequelize = getTestSequelize();
    const [rows] = await sequelize.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'Users'"
    );
    const present = new Set(rows.map((r) => r.column_name));
    for (const col of POST_0008_USER_COLUMNS) {
      expect(present.has(col)).toBe(true);
    }
  });

  afterAll(async () => {
    await getTestSequelize().close();
  });
});
