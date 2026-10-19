/**
 * Shared destructive wipe of tenant data used by test fixtures.
 *
 * Gating lives in the callers (the HTTP shim in routes/setup.js and the CLI
 * entrypoint in scripts/reset-test-database.js). This module does not check
 * environment variables. Never import it from production code paths.
 *
 * Issue #544.
 */
import User from "../models/User.js";
import Idea from "../models/Idea.js";
import Comment from "../models/Comment.js";
import Vote from "../models/Vote.js";

export async function resetTestDatabase() {
  await Vote.destroy({ where: {}, force: true });
  await Comment.destroy({ where: {}, force: true });
  await Idea.destroy({ where: {}, force: true });
  await User.destroy({ where: {}, force: true });
}
