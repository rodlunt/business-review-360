/**
 * Issue #588 — redactForAudit unit tests.
 *
 * Pure helper, no I/O. Verifies the deny-list strips sensitive
 * fields recursively (including inside arrays and nested objects),
 * leaves non-sensitive fields alone, and is idempotent.
 */
import { describe, it, expect } from '@jest/globals';
import { redactForAudit } from '../../backend/src/middleware/auditLog.js';

describe('Issue #588 - redactForAudit', () => {
  it('returns null and undefined unchanged', () => {
    expect(redactForAudit(null)).toBeNull();
    expect(redactForAudit(undefined)).toBeUndefined();
  });

  it('returns primitives unchanged', () => {
    expect(redactForAudit('hello')).toBe('hello');
    expect(redactForAudit(42)).toBe(42);
    expect(redactForAudit(true)).toBe(true);
    expect(redactForAudit(false)).toBe(false);
  });

  it('strips password / password_hash / token / secret / api_key from a flat object', () => {
    const input = {
      id: 1,
      email: 'a@x.com',
      password: 'p4ss',
      password_hash: '$2b$10$...',
      token: 't0k',
      refresh_token: 'r3fresh',
      refreshToken: 'r3freshcamel',
      secret: 's3cret',
      api_key: 'k3y',
      apiKey: 'k3ycamel',
      role: 'admin',
    };
    const out = redactForAudit(input);
    expect(out.id).toBe(1);
    expect(out.email).toBe('a@x.com');
    expect(out.role).toBe('admin');
    expect(out.password).toBe('[REDACTED]');
    expect(out.password_hash).toBe('[REDACTED]');
    expect(out.token).toBe('[REDACTED]');
    expect(out.refresh_token).toBe('[REDACTED]');
    expect(out.refreshToken).toBe('[REDACTED]');
    expect(out.secret).toBe('[REDACTED]');
    expect(out.api_key).toBe('[REDACTED]');
    expect(out.apiKey).toBe('[REDACTED]');
  });

  it('strips sensitive keys recursively from nested objects', () => {
    const input = {
      user: {
        id: 1,
        password: 'p4ss',
        nested: { token: 't0k', display_name: 'Alice' },
      },
    };
    const out = redactForAudit(input);
    expect(out.user.id).toBe(1);
    expect(out.user.password).toBe('[REDACTED]');
    expect(out.user.nested.token).toBe('[REDACTED]');
    expect(out.user.nested.display_name).toBe('Alice');
  });

  it('strips sensitive keys from objects inside arrays', () => {
    const input = {
      users: [
        { id: 1, password: 'a' },
        { id: 2, password: 'b' },
      ],
    };
    const out = redactForAudit(input);
    expect(out.users).toHaveLength(2);
    expect(out.users[0].id).toBe(1);
    expect(out.users[0].password).toBe('[REDACTED]');
    expect(out.users[1].id).toBe(2);
    expect(out.users[1].password).toBe('[REDACTED]');
  });

  it('is idempotent — calling twice returns identical output', () => {
    const input = { password: 'p4ss', email: 'a@x.com' };
    const once = redactForAudit(input);
    const twice = redactForAudit(once);
    expect(twice).toEqual(once);
  });

  it('does not mutate the input object', () => {
    const input = { password: 'p4ss', email: 'a@x.com' };
    redactForAudit(input);
    expect(input.password).toBe('p4ss');
    expect(input.email).toBe('a@x.com');
  });
});
