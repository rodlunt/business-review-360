// Single source of truth for password hashing and the login timing
// equalisers.
//
// Since #938 (2026-08-19) the primary algorithm is Argon2id at the OWASP
// Password Storage Cheat Sheet's recommended minimum (19 MiB memory,
// timeCost 2, parallelism 1). bcrypt remains verify-only for hashes minted
// before the cutover: verifyPassword() dispatches on the hash prefix, and
// upgradeHashIfNeeded() rehashes a bcrypt credential to Argon2id on the
// next successful login (lazy migration; no forced resets, no bulk rehash,
// because only the login moment has the plaintext).
//
// TIMING PARITY. Phase 5a (#858) added a constant-time defence to the
// login paths: when an email resolves to zero rows, a split identity, an
// account with no passwordHash, or a locked throttle key, the handler
// still burns a full verify against a dummy hash so response time does not
// reveal whether the account exists. That dummy must use the SAME
// algorithm and parameters as real hashes or the oracle reopens; it is
// therefore an Argon2id hash at ARGON2_OPTIONS, and
// passwordHashParity.test.js asserts the embedded parameters stay in
// lockstep. (During the migration window bcrypt-era accounts verify
// slightly faster than Argon2id ones; both are real accounts, so that
// difference is not an enumeration oracle.)
//
// Dummy hashes are kept as literals (not derived at module load) so
// importing this module never pays a hash at startup or per Jest file;
// the parity test is the drift guard.

import argon2 from "argon2";
import bcrypt from "bcrypt";

// OWASP Password Storage Cheat Sheet minimum configuration for Argon2id.
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456, // KiB = 19 MiB
  timeCost: 2,
  parallelism: 1,
};

// Legacy work factor: verify-only since #938. Real hashing goes through
// hashPassword(). Kept exported for the parity test and any historical
// tooling that reasons about bcrypt-era hashes.
export const BCRYPT_COST = 12;

// Generated once with bcrypt.hashSync(<random throwaway>, BCRYPT_COST).
// No password verifies against it. Retained for timing parity anywhere a
// legacy bcrypt comparison needs equalising.
export const DUMMY_PASSWORD_HASH = "$2b$12$jup.CjJZLuJWITXxEOLQlO5RWCFx4kNSN3mfFL3I5P/mks.ZugQ62";

// Generated once with argon2.hash(<random throwaway>, ARGON2_OPTIONS).
// No password verifies against it; verifyDummy() burns time against it.
export const DUMMY_ARGON2_HASH =
  "$argon2id$v=19$m=19456,p=1,t=2$dywvGsYmmMA6bWsZ5agyZw$xyJwNWF25EFaNGd+bSElWCdIBGY9bREsymArEvZuSrU";

/** Hash a plaintext password with the current algorithm and parameters. */
export async function hashPassword(plain) {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

/**
 * Verify a plaintext against a stored hash, dispatching on format:
 * Argon2id for current hashes, bcrypt for pre-#938 legacy ones. A missing
 * or unrecognised hash burns a dummy verify (timing parity) and fails.
 */
export async function verifyPassword(hash, plain) {
  if (typeof hash === "string" && hash.startsWith("$argon2")) {
    return argon2.verify(hash, plain);
  }
  if (typeof hash === "string" && hash.startsWith("$2")) {
    return bcrypt.compare(plain, hash);
  }
  await verifyDummy(plain);
  return false;
}

/**
 * Burn the same work as a real verify without any real credential, for
 * the enumeration-oracle paths (unknown account, locked key, no hash).
 */
export async function verifyDummy(plain) {
  await argon2.verify(DUMMY_ARGON2_HASH, plain || "");
  return false;
}

/** True when a stored hash should be re-minted with current parameters. */
export function needsRehash(hash) {
  if (typeof hash !== "string" || !hash.startsWith("$argon2")) return true;
  return argon2.needsRehash(hash, ARGON2_OPTIONS);
}

/**
 * Lazy migration step, called ONLY after a successful verify while the
 * plaintext is in hand: re-mint a legacy or under-parameterised hash and
 * persist it. A failure here must never fail the login (the user proved
 * their credential; the next successful login simply retries the upgrade),
 * which is why the error is logged and swallowed rather than rethrown.
 *
 * @param {{ passwordHash: string, save: Function }} user Sequelize user.
 * @param {string} plain The just-verified plaintext.
 * @param {{ warn: Function }} [log] Logger; defaults to console-free noop.
 * @returns {boolean} Whether an upgrade was persisted.
 */
export async function upgradeHashIfNeeded(user, plain, log) {
  if (!needsRehash(user.passwordHash)) return false;
  try {
    user.passwordHash = await hashPassword(plain);
    await user.save();
    return true;
  } catch (err) {
    if (log && log.warn) {
      log.warn("[PasswordHash] Lazy Argon2id upgrade failed; will retry next login", {
        message: err.message,
      });
    }
    return false;
  }
}
