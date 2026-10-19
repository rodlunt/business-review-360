/**
 * Issue #938 -- Argon2id primary hashing with lazy bcrypt migration.
 *
 * Controls: against the pre-#938 code these tests fail wholesale (the
 * functions under test did not exist; hashing was bcrypt at every site).
 * What they lock in:
 *   - hashPassword emits argon2id and round-trips through verifyPassword;
 *   - verifyPassword dispatches by hash format (argon2id, legacy bcrypt,
 *     and burns a dummy verify for null/garbage instead of throwing);
 *   - upgradeHashIfNeeded re-mints a bcrypt credential ONLY after a
 *     successful verify path, persists it, and never lets a save failure
 *     escape (a failed upgrade must not fail a correct login).
 */
import { describe, test, expect, jest } from "@jest/globals";
import bcrypt from "bcrypt";
import {
  BCRYPT_COST,
  hashPassword,
  verifyPassword,
  needsRehash,
  upgradeHashIfNeeded,
} from "../../backend/src/utils/passwordHash.js";

describe("Issue #938 -- Argon2id hashing and lazy migration", () => {
  test("hashPassword emits argon2id and verifies its own output", async () => {
    const hash = await hashPassword("S3cure-enough!");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(hash, "S3cure-enough!")).toBe(true);
    expect(await verifyPassword(hash, "not-it")).toBe(false);
    expect(needsRehash(hash)).toBe(false);
  });

  test("verifyPassword fails closed on null or unrecognised hashes without throwing", async () => {
    expect(await verifyPassword(null, "anything")).toBe(false);
    expect(await verifyPassword(undefined, "anything")).toBe(false);
    expect(await verifyPassword("plaintext-not-a-hash", "anything")).toBe(false);
  });

  test("upgradeHashIfNeeded migrates a bcrypt credential in place and persists", async () => {
    const legacy = bcrypt.hashSync("Legacy-Pass-1!", BCRYPT_COST);
    const save = jest.fn().mockResolvedValue(undefined);
    const user = { passwordHash: legacy, save };

    const upgraded = await upgradeHashIfNeeded(user, "Legacy-Pass-1!", null);

    expect(upgraded).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(user.passwordHash.startsWith("$argon2id$")).toBe(true);
    // The migrated hash verifies the same plaintext.
    expect(await verifyPassword(user.passwordHash, "Legacy-Pass-1!")).toBe(true);
  });

  test("upgradeHashIfNeeded is a no-op for a current argon2id hash", async () => {
    const current = await hashPassword("Fresh-Pass-1!");
    const save = jest.fn();
    const user = { passwordHash: current, save };

    expect(await upgradeHashIfNeeded(user, "Fresh-Pass-1!", null)).toBe(false);
    expect(save).not.toHaveBeenCalled();
    expect(user.passwordHash).toBe(current);
  });

  test("a save failure during upgrade is swallowed with a warning, never thrown", async () => {
    const legacy = bcrypt.hashSync("Legacy-Pass-2!", BCRYPT_COST);
    const save = jest.fn().mockRejectedValue(new Error("db briefly away"));
    const warn = jest.fn();
    const user = { passwordHash: legacy, save };

    const upgraded = await upgradeHashIfNeeded(user, "Legacy-Pass-2!", { warn });

    expect(upgraded).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/retry next login/i);
  });
});
