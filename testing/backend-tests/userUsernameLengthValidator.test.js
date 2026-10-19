/**
 * Regression test for issue #537.
 *
 * The Sequelize User model declares `username` as `DataTypes.STRING` (default
 * length 255), and prod schema was widened from VARCHAR(50) to VARCHAR(255)
 * to match. As belt-and-braces, a model-side `validate: { len: [1, 255] }`
 * was added so a too-long username surfaces as a clean Sequelize
 * ValidationError before any DB call, instead of a raw PG error post-INSERT.
 *
 * This test pins that validator behaviour so the guard cannot silently
 * disappear in a refactor.
 */
import { describe, it, expect } from '@jest/globals';

// Issue #593: backend/jest.setup.js sets DATABASE_URL=sqlite::memory: before
// any test module resolves, so the User model can construct its Sequelize
// instance without a live DB. .validate() runs the validators without
// touching the connection.
const { default: User } = await import('../../backend/src/models/User.js');

const REQUIRED_FIELDS = {
  passwordHash: 'placeholder',
  tenant_id: '00000000-0000-0000-0000-000000000000',
};

describe('User model - username length validator (issue #537)', () => {
  it('declares len: [1, 255] on the username attribute', () => {
    const attr = User.getAttributes().username;
    expect(attr.validate).toBeDefined();
    expect(attr.validate.len).toEqual([1, 255]);
  });

  it('accepts a 255-char username', async () => {
    const username = 'a'.repeat(255);
    const instance = User.build({ username, ...REQUIRED_FIELDS });
    await expect(instance.validate()).resolves.toBeDefined();
  });

  it('rejects a 256-char username with a Validation len error', async () => {
    const username = 'a'.repeat(256);
    const instance = User.build({ username, ...REQUIRED_FIELDS });
    await expect(instance.validate()).rejects.toMatchObject({
      name: 'SequelizeValidationError',
      errors: expect.arrayContaining([
        expect.objectContaining({
          path: 'username',
          validatorKey: 'len',
        }),
      ]),
    });
  });

  it('rejects an empty username with a Validation len error', async () => {
    const instance = User.build({ username: '', ...REQUIRED_FIELDS });
    await expect(instance.validate()).rejects.toMatchObject({
      name: 'SequelizeValidationError',
      errors: expect.arrayContaining([
        expect.objectContaining({
          path: 'username',
          validatorKey: 'len',
        }),
      ]),
    });
  });
});
