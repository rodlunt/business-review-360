/**
 * Issue #745: EmailQueue SKIP LOCKED concurrency test.
 *
 * Proves the claim phase (`SELECT ... FOR UPDATE SKIP LOCKED`) gives two
 * concurrent workers disjoint row sets so neither double-sends. Uses a
 * SEPARATE Sequelize instance from the global fixture (pool.max=4 so two
 * transactions can run on different connections concurrently); the RLS
 * fixture's pool.max=1 would force serialisation and defeat the test.
 *
 * The two transactions run via Promise.all and each lock 4 rows out of an
 * 8-row pending pool. With SKIP LOCKED, each transaction gets a disjoint
 * 4. Without it, both would read the same 8 rows.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
} from "@jest/globals";
import { Sequelize, QueryTypes } from "sequelize";

const ORG_HANDLE = "skip-locked-745";

let pool;
const seededIds = [];

beforeAll(async () => {
  const uri = process.env.PG_TEST_URI;
  if (!uri) {
    throw new Error(
      "PG_TEST_URI not set. Run via `npm run test:integration` so globalSetup starts the container."
    );
  }
  // Separate Sequelize with pool.max=4 -- the fixture instance is pool.max=1
  // for RLS determinism.
  pool = new Sequelize(uri, {
    dialect: "postgres",
    logging: false,
    pool: { max: 4, min: 0, acquire: 30000, idle: 10000 },
  });

  // Seed an Organization (FK target for EmailQueue.organizationId).
  await pool.query(
    `INSERT INTO "Organizations" (id, "organizationId", "organizationName", "createdAt", "updatedAt")
     VALUES (gen_random_uuid(), :handle, 'SKIP LOCKED test org', NOW(), NOW())
     ON CONFLICT ("organizationId") DO NOTHING`,
    { replacements: { handle: ORG_HANDLE } }
  );

  // Seed 8 pending queue rows.
  for (let i = 0; i < 8; i++) {
    const [{ id }] = await pool.query(
      `INSERT INTO "EmailQueue" (id, "organizationId", type, priority, status, "to", subject, data, "scheduledFor", attempts, "maxAttempts", "createdAt", "updatedAt")
       VALUES (gen_random_uuid(), :handle, 'skip-locked-test', 5, 'pending', :to, 'test', '{}'::jsonb, NOW(), 0, 3, NOW(), NOW())
       RETURNING id`,
      {
        replacements: { handle: ORG_HANDLE, to: `seed-${i}@example.com` },
        type: QueryTypes.SELECT,
      }
    );
    seededIds.push(id);
  }
});

afterAll(async () => {
  if (pool && seededIds.length > 0) {
    // ANY(ARRAY[...]::uuid[]) is the Postgres-explicit way to delete a
    // set of UUIDs without depending on Sequelize replacement-array
    // expansion in raw SQL (which has been finicky here).
    await pool.query(
      `DELETE FROM "EmailQueue" WHERE id = ANY(ARRAY[:ids]::uuid[])`,
      { replacements: { ids: seededIds } }
    );
  }
  if (pool) await pool.close();
});

describe("EmailQueue FOR UPDATE SKIP LOCKED -- concurrent claim isolation (#745)", () => {
  it("two concurrent transactions each claim 4 disjoint rows from an 8-row pool", async () => {
    // Each "claim" opens a transaction, locks up to 4 pending rows with
    // FOR UPDATE SKIP LOCKED, and HOLDS the lock until the outer
    // Promise.all settles. Holding both locks open simultaneously is
    // what proves SKIP LOCKED -- if either commits before the other
    // queries, the second simply sees the first's rows as released and
    // the disjoint-set property is uninteresting.
    let resolveBarrier;
    const barrier = new Promise((resolve) => {
      resolveBarrier = resolve;
    });
    let waitCount = 0;
    const arriveBarrier = async () => {
      waitCount++;
      if (waitCount === 2) resolveBarrier();
      await barrier;
    };

    const claim = () =>
      pool.transaction(async (tx) => {
        const rows = await pool.query(
          `SELECT id FROM "EmailQueue"
           WHERE status = 'pending' AND "organizationId" = :handle
           ORDER BY priority ASC, "scheduledFor" ASC
           LIMIT 4
           FOR UPDATE SKIP LOCKED`,
          {
            replacements: { handle: ORG_HANDLE },
            transaction: tx,
            type: QueryTypes.SELECT,
          }
        );
        // Hold the lock until BOTH claims have queried, so neither
        // releases its rows before the other reads.
        await arriveBarrier();
        return rows.map((r) => r.id);
      });

    const [claimA, claimB] = await Promise.all([claim(), claim()]);

    expect(claimA.length).toBe(4);
    expect(claimB.length).toBe(4);

    const intersection = claimA.filter((id) => claimB.includes(id));
    expect(intersection).toEqual([]);

    // Union covers all 8 seeded rows.
    const union = new Set([...claimA, ...claimB]);
    expect(union.size).toBe(8);
    for (const id of seededIds) {
      expect(union.has(id)).toBe(true);
    }
  });
});
