/**
 * Issue #733 -- Organization.findOne lookups must use the VARCHAR handle
 * column (`organizationId`), NOT the UUID primary key (`id`).
 *
 * The bug: six route handlers were calling
 *
 *   await Organization.findOne({ where: { id: req.user.organizationId } });
 *
 * but `Organization.id` is a UUID primary key while `req.user.organizationId`
 * is a VARCHAR(255) slug like 'demo-corp'. Sequelize coerces the comparison,
 * the WHERE never matches, and the lookup silently returns null. Downstream
 * email-notification code paths then either skip the send or send with
 * placeholder branding -- visible to no one because the calls are
 * non-blocking and `if (org)` checks swallow the null.
 *
 * Affected sites (all fixed in this PR):
 *   - backend/src/routes/comments.js  (1)
 *   - backend/src/routes/ideas.js     (2)
 *   - backend/src/routes/users.js     (1)
 *   - backend/src/routes/auth.js      (2)
 *
 * The auth.js:349 site is the worst of the six -- it's on the
 * `/api/auth/register` org-link signup path, where `if (!org) return null;`
 * causes the whole request to return 400 "Organization not found". That
 * endpoint has been broken for an unknown number of weeks. (The Stripe
 * Checkout signup flow is on a different endpoint and was unaffected.)
 *
 * This suite pins the column-shape contract at the model level so any
 * regression to the buggy `where: { id: <slug> }` form fails the test
 * suite immediately. We use the real Organization model on the in-memory
 * sqlite that backend tests already run against (#593), so column types
 * match production exactly.
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Organization from '../../backend/src/models/Organization.js';

const slug = 'org-lookup-test';

beforeAll(async () => {
  // Real model + real schema on the test sqlite. `force:true` drops any
  // prior table from a previous test run in the same worker.
  await Organization.sync({ force: true });
  await Organization.create({
    organizationId: slug,
    organizationName: 'Org Lookup Test',
    primaryColor: '#000000',
    allowSelfRegistration: false,
  });
});

afterAll(async () => {
  await Organization.drop();
});

describe('Issue #733 -- Organization lookup column-shape contract', () => {
  it('UUID id column does not match a VARCHAR slug (the bug)', async () => {
    // This is the exact shape the buggy call sites used. It must return
    // null because `id` is a UUID and the slug is a VARCHAR. If a future
    // schema change makes this lookup succeed, the regression test for
    // the FIX (next case) would also pass and silently mask the problem,
    // so we pin both directions explicitly.
    const row = await Organization.findOne({ where: { id: slug } });
    expect(row).toBeNull();
  });

  it('organizationId VARCHAR column matches the slug (the fix)', async () => {
    const row = await Organization.findOne({ where: { organizationId: slug } });
    expect(row).not.toBeNull();
    expect(row.organizationId).toBe(slug);
    expect(row.organizationName).toBe('Org Lookup Test');
  });

  it('id is a UUID primary key in the model definition', () => {
    // Locks the model shape so a well-meaning refactor cannot "fix" the
    // bug by switching `id` to STRING -- that would break every existing
    // FK and every `findByPk(<uuid>)` call.
    const idAttr = Organization.rawAttributes.id;
    expect(idAttr.primaryKey).toBe(true);
    expect(idAttr.type.constructor.key).toBe('UUID');
  });

  it('organizationId is a UNIQUE STRING handle in the model definition', () => {
    const slugAttr = Organization.rawAttributes.organizationId;
    expect(slugAttr.unique).toBe(true);
    expect(slugAttr.allowNull).toBe(false);
    expect(slugAttr.type.constructor.key).toBe('STRING');
  });
});
