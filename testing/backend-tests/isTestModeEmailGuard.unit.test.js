/**
 * Issue #577 - `isTestMode` must not swallow real recipients whose
 * address happens to start with "test" (e.g. `testing@customer.com`,
 * `test_admin@orgdomain.com`).
 *
 * Originally this helper lived in two places (sendEmail.js + mailer.js) and
 * the test exercised both. Since #708 dropped mailer.js, sendEmail.js is the
 * sole implementation under test.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { isTestMode as isTestModeSendEmail } from '../../backend/src/emails/utils/sendEmail.js';

const variants = [
  ['sendEmail.js', isTestModeSendEmail],
];

describe.each(variants)('Issue #577 - isTestMode in %s', (_label, isTestMode) => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Jest defaults NODE_ENV to 'test', which makes isTestMode unconditionally
    // true and masks the per-address logic. Override to a non-test value so
    // the address matchers are the only thing under test.
    process.env.NODE_ENV = 'production';
    // Force hasEmailConfig=true so we exercise the address-based branch and
    // not the "no provider configured" fallback.
    process.env.RESEND_API_KEY = 're_test_unit_only_not_a_real_key';
    delete process.env.GMAIL_USER;
    delete process.env.GMAIL_PASS;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('classifies known dev/test addresses as test mode', () => {
    it('catches *@example.com', () => {
      expect(isTestMode('alice@example.com')).toBe(true);
      expect(isTestMode('test@example.com')).toBe(true);
    });

    it('catches *@test.com', () => {
      expect(isTestMode('user@test.com')).toBe(true);
    });

    it('catches addresses containing "testuser"', () => {
      expect(isTestMode('testuser@anywhere.com')).toBe(true);
      expect(isTestMode('jane.testuser@corp.io')).toBe(true);
    });

    it('catches addresses containing "localhost"', () => {
      expect(isTestMode('dev@localhost')).toBe(true);
      expect(isTestMode('admin@app.localhost')).toBe(true);
    });
  });

  describe('does NOT classify real customers with a "test" prefix as test mode', () => {
    it('treats testing@customer.com as a real recipient', () => {
      expect(isTestMode('testing@customer.com')).toBe(false);
    });

    it('treats test_admin@orgdomain.com as a real recipient', () => {
      expect(isTestMode('test_admin@orgdomain.com')).toBe(false);
    });

    it('treats tester@realdomain.au as a real recipient', () => {
      expect(isTestMode('tester@realdomain.au')).toBe(false);
    });
  });

  describe('classifies as test mode when no email provider is configured', () => {
    it('returns true regardless of address when both Resend and Gmail are unset', () => {
      delete process.env.RESEND_API_KEY;
      delete process.env.GMAIL_USER;
      delete process.env.GMAIL_PASS;
      expect(isTestMode('real@customer.com')).toBe(true);
    });
  });
});
