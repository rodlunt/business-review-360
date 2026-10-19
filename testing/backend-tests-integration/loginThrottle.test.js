/**
 * Issue #859 -- loginThrottle integration coverage (real Postgres).
 *
 * This is the slice 5a could NOT have: LoginThrottle has no RLS policy,
 * so it works under the fixture's constrained NOBYPASSRLS role. The
 * Postgres-only SQL (ON CONFLICT / FOR UPDATE / make_interval) and the
 * window / lock / escalation logic are exercised end to end against the
 * containerised DB with migration 0022 applied (globalSetup runs
 * runMigrations).
 *
 * The service connects via backend/src/models/database.js, built from
 * DATABASE_URL at import. We point DATABASE_URL at the container and
 * dynamic-import the service AFTER, so it writes to the same Postgres
 * the fixture's getTestSequelize reads from for assertions.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  jest,
} from "@jest/globals";
import { getTestSequelize } from "../test-fixtures/postgres-rls-fixture.js";

jest.setTimeout(30000);

let sequelize;
let svc;
const BASE_MS = 800;

beforeAll(async () => {
  sequelize = getTestSequelize(); // ensures PG_TEST_URI is populated
  process.env.DATABASE_URL = process.env.PG_TEST_URI;
  process.env.DISABLE_RATE_LIMIT = "false";
  delete process.env.DISABLE_LOGIN_LOCKOUT;
  process.env.LOGIN_LOCKOUT_MAX_FAILURES = "3";
  process.env.LOGIN_LOCKOUT_WINDOW_MS = "60000";
  process.env.LOGIN_LOCKOUT_BASE_MS = String(BASE_MS);
  process.env.LOGIN_LOCKOUT_MAX_MS = "86400000";
  svc = await import("../../backend/src/services/loginThrottle.js");
});

afterAll(async () => {
  await sequelize.query('DELETE FROM "LoginThrottle"');
});

const lockedUntilOf = async (key) => {
  const [rows] = await sequelize.query(
    'SELECT "lockedUntil", "lockStrikes", "failedCount" FROM "LoginThrottle" WHERE "key" = $1',
    { bind: [key] }
  );
  return rows[0] || null;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe("loginThrottle integration (real Postgres, no RLS)", () => {
  it("does not lock below the threshold, locks at it", async () => {
    const key = `email:below-${Date.now()}@x.com`;
    await svc.registerFailure(key);
    await svc.registerFailure(key);
    expect(await svc.isLocked(key)).toBe(false); // 2 < max(3)

    await svc.registerFailure(key); // 3rd -> lock
    expect(await svc.isLocked(key)).toBe(true);

    const row = await lockedUntilOf(key);
    expect(row.lockStrikes).toBe(1);
    expect(new Date(row.lockedUntil).getTime()).toBeGreaterThan(Date.now());
  });

  it("clearThrottle fully unlocks (row removed)", async () => {
    const key = `email:clear-${Date.now()}@x.com`;
    await svc.registerFailure(key);
    await svc.registerFailure(key);
    await svc.registerFailure(key);
    expect(await svc.isLocked(key)).toBe(true);

    await svc.clearThrottle(key);
    expect(await svc.isLocked(key)).toBe(false);
    expect(await lockedUntilOf(key)).toBeNull();
  });

  it("an active lock is not extended by further failures", async () => {
    const key = `email:noextend-${Date.now()}@x.com`;
    await svc.registerFailure(key);
    await svc.registerFailure(key);
    await svc.registerFailure(key); // locked, strike 1
    const first = await lockedUntilOf(key);

    await svc.registerFailure(key);
    await svc.registerFailure(key); // attempts during the lock
    const after = await lockedUntilOf(key);

    expect(after.lockStrikes).toBe(first.lockStrikes); // still 1
    expect(new Date(after.lockedUntil).getTime()).toBe(
      new Date(first.lockedUntil).getTime()
    ); // unchanged
  });

  it("escalates the lock duration on a fresh lock cycle", async () => {
    const key = `email:escalate-${Date.now()}@x.com`;
    await svc.registerFailure(key);
    await svc.registerFailure(key);
    await svc.registerFailure(key); // strike 1, ~BASE_MS
    const r1 = await lockedUntilOf(key);
    const dur1 = new Date(r1.lockedUntil).getTime() - Date.now();

    await sleep(BASE_MS + 250); // let strike-1 lock expire
    expect(await svc.isLocked(key)).toBe(false);

    await svc.registerFailure(key);
    await svc.registerFailure(key);
    await svc.registerFailure(key); // strike 2, ~2x BASE_MS
    const r2 = await lockedUntilOf(key);
    const dur2 = new Date(r2.lockedUntil).getTime() - Date.now();

    expect(r2.lockStrikes).toBe(2);
    expect(dur2).toBeGreaterThan(dur1); // escalated
  });

  it("fails open: isLocked returns false if the query errors", async () => {
    // A malformed key type cannot break login; the service swallows and
    // fails open (login still gated by the IP + email rate limiters).
    await expect(svc.isLocked(undefined)).resolves.toBe(false);
  });
});
