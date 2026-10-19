// Issue #561 Phase 1: smoke test the testcontainers fixture.
// Verifies globalSetup booted Postgres, the schema loaded, and the per-worker
// Sequelize is wired with pool.max=1.
import { describe, it, expect, afterAll } from "@jest/globals";
import { getTestSequelize } from "../test-fixtures/postgres-rls-fixture.js";

describe("Postgres testcontainers fixture", () => {
  it("connects to the started container and runs SELECT 1", async () => {
    const sequelize = getTestSequelize();
    const [results] = await sequelize.query("SELECT 1 AS ok");
    expect(Number(results[0].ok)).toBe(1);
  });

  it("exposes a Sequelize instance with pool.max === 1", () => {
    const sequelize = getTestSequelize();
    expect(sequelize.options.pool.max).toBe(1);
  });

  it("loaded the canonical schema (Organizations table exists)", async () => {
    const sequelize = getTestSequelize();
    const [results] = await sequelize.query(
      "SELECT to_regclass('public.\"Organizations\"') AS tbl"
    );
    // to_regclass quotes camelCase identifiers in its returned text form.
    expect(results[0].tbl).not.toBeNull();
    expect(String(results[0].tbl)).toMatch(/Organizations/);
  });

  afterAll(async () => {
    const sequelize = getTestSequelize();
    await sequelize.close();
  });
});
