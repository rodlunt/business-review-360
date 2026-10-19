-- Migration 0026: author/user FKs to ON DELETE SET NULL (#930)
--
-- Deleting a user previously cascade-deleted their ideas and comments, and
-- through the ideaId/commentId cascades took OTHER users' reply threads and
-- votes with them: one admin deleting a departed employee silently erased a
-- slice of the organisation's review history and retroactively shrank every
-- historical analytics number. Surveys.userId and Categories.createdBy
-- already used SET NULL, so content-outlives-author was the schema's own
-- half-applied convention; this migration completes it.
--
-- Decision record (2026-08-19, owner call on #930):
--   - Content is organisational property and survives its author. A null
--     author renders as "Former member" in the UI.
--   - Votes survive too: they are org sentiment feeding analytics counts,
--     and the per-tenant unique indexes tolerate multiple NULL userIds.
--   - True erasure (delete user AND purge their authored content) is
--     deliberately NOT implemented: destructive semantics must not hide in
--     DDL. If a privacy request ever needs it, build it as an explicit,
--     named service action with its own confirmation; see the note on
--     userService.deleteUser.
--
-- Constraint names verified against prod pg_constraint before writing.

ALTER TABLE "Ideas"
  DROP CONSTRAINT IF EXISTS "Ideas_authorId_fkey";
ALTER TABLE "Ideas"
  ADD CONSTRAINT "Ideas_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "Users"(id) ON DELETE SET NULL;

ALTER TABLE "Comments"
  DROP CONSTRAINT IF EXISTS "Comments_authorId_fkey";
ALTER TABLE "Comments"
  ADD CONSTRAINT "Comments_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "Users"(id) ON DELETE SET NULL;

ALTER TABLE "Votes"
  DROP CONSTRAINT IF EXISTS "Votes_userId_fkey";
ALTER TABLE "Votes"
  ADD CONSTRAINT "Votes_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "Users"(id) ON DELETE SET NULL;

ALTER TABLE "CommentVotes"
  DROP CONSTRAINT IF EXISTS "CommentVotes_userId_fkey";
ALTER TABLE "CommentVotes"
  ADD CONSTRAINT "CommentVotes_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "Users"(id) ON DELETE SET NULL;
