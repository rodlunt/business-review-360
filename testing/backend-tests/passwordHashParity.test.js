/**
 * Timing-parity drift guards for the login enumeration defence.
 *
 * Phase 5a (#858) made the login paths burn a constant-time verify
 * against a dummy hash for the no-user / split-identity / null-hash /
 * locked cases so response timing cannot enumerate which accounts exist.
 * The defence only holds while the dummy uses the SAME algorithm and
 * parameters as real hashes.
 *
 * Since #938 the real algorithm is Argon2id at ARGON2_OPTIONS, so the
 * primary guard now ties DUMMY_ARGON2_HASH's embedded parameters to
 * ARGON2_OPTIONS and to what hashPassword() actually emits. The legacy
 * bcrypt guards remain because bcrypt hashes are still verified
 * (verify-only) until every credential has lazily migrated.
 */
import { describe, test, expect } from "@jest/globals";
import bcrypt from "bcrypt";
import argon2 from "argon2";
import {
  ARGON2_OPTIONS,
  BCRYPT_COST,
  DUMMY_PASSWORD_HASH,
  DUMMY_ARGON2_HASH,
  hashPassword,
  verifyPassword,
  verifyDummy,
  needsRehash,
} from "../../backend/src/utils/passwordHash.js";

function argonParams(hash) {
  const m = hash.match(/^\$argon2id\$v=\d+\$m=(\d+),p=(\d+),t=(\d+)\$/);
  // node-argon2 serialises m,p,t in this order regardless of option order.
  return m && { memoryCost: Number(m[1]), parallelism: Number(m[2]), timeCost: Number(m[3]) };
}

describe("password hash parity (login timing defence)", () => {
  test("DUMMY_ARGON2_HASH is a valid argon2id hash at ARGON2_OPTIONS (drift guard)", () => {
    const params = argonParams(DUMMY_ARGON2_HASH);
    expect(params).not.toBeNull();
    expect(params.memoryCost).toBe(ARGON2_OPTIONS.memoryCost);
    expect(params.timeCost).toBe(ARGON2_OPTIONS.timeCost);
    expect(params.parallelism).toBe(ARGON2_OPTIONS.parallelism);
  });

  test("a hash freshly produced by hashPassword carries the same parameters", async () => {
    // Ties the dummy's parameters to what the real path actually emits,
    // so the guard tracks reality, not a self-consistent constant.
    const fresh = await hashPassword("parity-probe-not-a-real-password");
    expect(argonParams(fresh)).toEqual(argonParams(DUMMY_ARGON2_HASH));
    expect(needsRehash(fresh)).toBe(false);
  });

  test("no password verifies against either dummy hash", async () => {
    expect(await verifyDummy("")).toBe(false);
    expect(await verifyDummy("Password123!")).toBe(false);
    expect(bcrypt.compareSync("Password123!", DUMMY_PASSWORD_HASH)).toBe(false);
    expect(await argon2.verify(DUMMY_ARGON2_HASH, "Password123!")).toBe(false);
  });

  test("legacy: DUMMY_PASSWORD_HASH stays a valid bcrypt hash at BCRYPT_COST", () => {
    expect(DUMMY_PASSWORD_HASH).toMatch(/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/);
    expect(bcrypt.getRounds(DUMMY_PASSWORD_HASH)).toBe(BCRYPT_COST);
  });

  test("legacy bcrypt hashes still verify and are flagged for rehash", async () => {
    const legacy = bcrypt.hashSync("Correct-Horse-9!", BCRYPT_COST);
    expect(await verifyPassword(legacy, "Correct-Horse-9!")).toBe(true);
    expect(await verifyPassword(legacy, "wrong")).toBe(false);
    expect(needsRehash(legacy)).toBe(true);
  });
});
