/**
 * Regression test for issue #487.
 *
 * The `isApproved` column exists in `db/clean_minimal_schema.sql` but was
 * missing from `backend/src/models/User.js`, causing
 * `User.findOne({ attributes: ['isApproved'] })` to silently drop the field.
 *
 * This test pins the model definition to the schema so the drift cannot
 * reappear unnoticed. It is self-contained and does not require a live
 * database connection: Sequelize only opens a connection when you call
 * `authenticate()` or run a query, neither of which happens here.
 */
import { describe, it, expect } from '@jest/globals';

// Issue #593: backend/jest.setup.js sets DATABASE_URL=sqlite::memory: before
// any test module resolves, so the User model can construct its Sequelize
// instance without further setup. The dynamic import is kept because the
// surrounding suite mixes static and dynamic imports under
// experimental-vm-modules.
const { default: User } = await import('../../backend/src/models/User.js');

// Resolve DataTypes via the same Sequelize class the User model is bound to.
// Importing { DataTypes } from 'sequelize' directly here yields a separate
// classToInvokable wrapper under Jest's experimental-vm-modules isolation,
// which makes `instanceof` fail with the misleading "Expected constructor:
// BOOLEAN, Received constructor: BOOLEAN" message (issue #670 root cause).
const { DataTypes } = User.sequelize.Sequelize;

describe('User model - isApproved attribute (issue #487)', () => {
  const attributes = User.getAttributes();

  it('defines the isApproved attribute', () => {
    expect(attributes).toHaveProperty('isApproved');
  });

  it('types isApproved as BOOLEAN', () => {
    const attr = attributes.isApproved;
    expect(attr.type).toBeInstanceOf(DataTypes.BOOLEAN);
  });

  it('marks isApproved as NOT NULL to match the schema', () => {
    expect(attributes.isApproved.allowNull).toBe(false);
  });

  it('defaults isApproved to true to match the schema default', () => {
    expect(attributes.isApproved.defaultValue).toBe(true);
  });

  it('also exposes isApproved via rawAttributes', () => {
    expect(User.rawAttributes).toHaveProperty('isApproved');
    expect(User.rawAttributes.isApproved.defaultValue).toBe(true);
  });
});
