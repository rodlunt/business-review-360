/**
 * Self-test for the Jest env-isolation harness wired in jest.setup.js.
 *
 * Issue #593: if a future contributor reverts the NODE_ENV guard in the model
 * modules, drops `setupFiles` from package.json, or commits a prod-shaped
 * value into backend/.env.test, this suite fails immediately with a message
 * that points back to the spec.
 *
 * Spec: docs/superpowers/specs/2026-04-26-593-env-leak-test-isolation-design.md
 */
import { describe, it, expect } from '@jest/globals';

describe('jest.setup harness (issue #593)', () => {
  it('forces NODE_ENV=test', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });

  it('loads DATABASE_URL=sqlite::memory: from backend/.env.test', () => {
    expect(process.env.DATABASE_URL).toBe('sqlite::memory:');
  });

  it('DATABASE_URL must not point at a prod-shaped Postgres host during tests', () => {
    // Regression assertion: if the model modules ever load the prod `.env`
    // again, `dotenv.config({ override: false })` would still leave the test
    // value untouched -- but only because jest.setup.js loaded .env.test
    // first. Pinning the negative shape here catches the case where someone
    // bypasses both layers.
    const url = process.env.DATABASE_URL;
    expect(url).not.toMatch(/^postgres:\/\/[^@]+@(?!localhost|127\.0\.0\.1)/);
    expect(url).not.toMatch(/@db:\d+\//);
  });

  it('loads PLATFORM_DATABASE_URL=sqlite::memory: from backend/.env.test', () => {
    expect(process.env.PLATFORM_DATABASE_URL).toBe('sqlite::memory:');
  });

  it('loads RESEND_API_KEY as empty string (mailer must be mocked)', () => {
    expect(process.env.RESEND_API_KEY).toBe('');
  });

  it('loads STRIPE_SECRET_KEY=sk_test_dummy (Stripe SDK must be mocked)', () => {
    expect(process.env.STRIPE_SECRET_KEY).toBe('sk_test_dummy');
  });

  it('loads JWT_SECRET dummy value from backend/.env.test', () => {
    expect(process.env.JWT_SECRET).toBe(
      'test-jwt-secret-do-not-use-in-prod-please'
    );
  });

  it('loads ENABLE_AUDIT_LOGGING=false so audit middleware is dormant', () => {
    expect(process.env.ENABLE_AUDIT_LOGGING).toBe('false');
  });
});
