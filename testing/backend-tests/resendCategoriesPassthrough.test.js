/**
 * Issue #575 -- the `categories` array passed to email senders must reach
 * Resend as `tags: [{name, value}]`, not be silently dropped.
 *
 * Issue #735 -- tag NAMES within a single send must be unique. Resend
 * rejects duplicate tag names with 422 validation_error
 * ("The 'category' tag is duplicated."), which silently broke every
 * transactional email in prod between #575's cutover and the 2026-05-02
 * smoke test that surfaced it. The fix maps the `[<email-type>, tenant]`
 * convention to `[{name:'category'}, {name:'tenant'}]` and adds an
 * explicit assertion that the helper never emits duplicate names.
 *
 * This suite covers two layers:
 *
 *   1. The pure translation helper `categoriesToResendTags` -- exercised in
 *      isolation so sanitisation rules (256-char cap, ASCII-only, empty
 *      values dropped) and the uniqueness invariant are pinned without any
 *      mock plumbing.
 *
 *   2. The `sendViaResend` wrapper, with the Resend SDK mocked at the
 *      module boundary (jest.unstable_mockModule pattern adopted from
 *      billingUsageAuth.test.js / billingSessionAuth.test.js). This proves
 *      the wrapper hands the SDK a `tags: [{name, value}]` array with
 *      distinct names and that no `categories` field leaks through.
 *
 * The original Layer 3 (nodemailer-fallback drops categories) was removed
 * along with the fallback itself in #708. Resend is now the sole transport,
 * so the categories-stripping concern is gone.
 *
 * No real Resend call is made -- the SDK is mocked.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module-boundary mocks. Must be registered BEFORE any code-under-test is
// imported so the mock factories are wired in. Pattern adopted from
// billingUsageAuth.test.js (issue #488).
// ---------------------------------------------------------------------------

const resendSendMock = jest.fn();
jest.unstable_mockModule('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: resendSendMock },
  })),
}));

// ---------------------------------------------------------------------------
// Layer 1: pure helper. No SDK plumbing required, but we still go through
// the same module under test that the other layers exercise.
// ---------------------------------------------------------------------------

const { categoriesToResendTags, sendViaResend } = await import(
  '../../backend/src/emails/utils/resendClient.js'
);

describe('Issue #575 / #735 -- categoriesToResendTags', () => {
  it('maps [type, tenant] to tags with distinct names "category" and "tenant"', () => {
    expect(categoriesToResendTags(['password-reset', 'org-foo'])).toEqual([
      { name: 'category', value: 'password-reset' },
      { name: 'tenant', value: 'org-foo' },
    ]);
  });

  it('returns an empty array for undefined / null / non-array input', () => {
    expect(categoriesToResendTags(undefined)).toEqual([]);
    expect(categoriesToResendTags(null)).toEqual([]);
    expect(categoriesToResendTags('password-reset')).toEqual([]);
    expect(categoriesToResendTags({})).toEqual([]);
  });

  it('drops empty / non-string entries silently and assigns names by valid-position', () => {
    expect(
      categoriesToResendTags(['password-reset', '', null, undefined, 42, 'org-foo']),
    ).toEqual([
      { name: 'category', value: 'password-reset' },
      { name: 'tenant', value: 'org-foo' },
    ]);
  });

  it('replaces characters outside [A-Za-z0-9_-] with underscores', () => {
    // dots, slashes, spaces, non-ASCII all fail Resend validation
    expect(categoriesToResendTags(['org.foo/bar baz', 'cafe!'])).toEqual([
      { name: 'category', value: 'org_foo_bar_baz' },
      { name: 'tenant', value: 'cafe_' },
    ]);
  });

  it('truncates values longer than 256 characters', () => {
    const long = 'a'.repeat(300);
    const [tag] = categoriesToResendTags([long]);
    expect(tag.name).toBe('category');
    expect(tag.value.length).toBe(256);
    expect(tag.value).toBe('a'.repeat(256));
  });

  it('drops entries that sanitise to an empty string', () => {
    expect(categoriesToResendTags([''])).toEqual([]);
  });

  // #735 regression guard: Resend rejects sends with duplicate tag names
  // (422 validation_error). The helper must never emit two tags with the
  // same `name`, no matter how many entries the caller passes.
  it('emits unique tag names for any input length (no duplicates)', () => {
    const inputs = [
      ['a'],
      ['a', 'b'],
      ['a', 'b', 'c'],
      ['a', 'b', 'c', 'd', 'e'],
    ];
    for (const input of inputs) {
      const tags = categoriesToResendTags(input);
      const names = tags.map(t => t.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('falls back to category3, category4, ... for the third entry onwards', () => {
    expect(categoriesToResendTags(['a', 'b', 'c', 'd'])).toEqual([
      { name: 'category', value: 'a' },
      { name: 'tenant', value: 'b' },
      { name: 'category3', value: 'c' },
      { name: 'category4', value: 'd' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Layer 2: sendViaResend hands the Resend SDK a tags array, not categories.
// ---------------------------------------------------------------------------

describe('Issue #575 -- sendViaResend translates categories to Resend tags', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Lazy SDK construction needs RESEND_API_KEY at first call.
    process.env.RESEND_API_KEY = 're_test_key_unit_only_module_boundary';

    resendSendMock.mockReset();
    resendSendMock.mockResolvedValue({ data: { id: 'msg_test_123' }, error: null });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('sends tags: [{category}, {tenant}] when categories is the [type, tenant] convention', async () => {
    await sendViaResend({
      to: 'user@example.com',
      from: 'hello@br360.example.com',
      subject: 'Reset your password',
      html: '<p>hi</p>',
      text: 'hi',
      categories: ['password-reset', 'org-foo'],
    });

    expect(resendSendMock).toHaveBeenCalledTimes(1);
    const payload = resendSendMock.mock.calls[0][0];
    expect(payload.tags).toEqual([
      { name: 'category', value: 'password-reset' },
      { name: 'tenant', value: 'org-foo' },
    ]);
    // The legacy `categories` key must not leak into the SDK call.
    expect(payload).not.toHaveProperty('categories');
  });

  it('omits tags entirely when categories is missing or empty', async () => {
    await sendViaResend({
      to: 'user@example.com',
      from: 'hello@br360.example.com',
      subject: 'Hello',
      html: '<p>hi</p>',
    });

    expect(resendSendMock).toHaveBeenCalledTimes(1);
    expect(resendSendMock.mock.calls[0][0]).not.toHaveProperty('tags');

    resendSendMock.mockClear();

    await sendViaResend({
      to: 'user@example.com',
      from: 'hello@br360.example.com',
      subject: 'Hello',
      html: '<p>hi</p>',
      categories: [],
    });

    expect(resendSendMock).toHaveBeenCalledTimes(1);
    expect(resendSendMock.mock.calls[0][0]).not.toHaveProperty('tags');
  });

  it('still maps replyTo to reply_to alongside tags', async () => {
    await sendViaResend({
      to: 'user@example.com',
      from: 'hello@br360.example.com',
      subject: 'Subject',
      html: '<p>hi</p>',
      replyTo: 'hello@br360.example.com',
      categories: ['support', 'org-foo'],
    });

    const payload = resendSendMock.mock.calls[0][0];
    expect(payload.reply_to).toBe('hello@br360.example.com');
    expect(payload.tags).toEqual([
      { name: 'category', value: 'support' },
      { name: 'tenant', value: 'org-foo' },
    ]);
  });

  it('throws when the SDK returns an error envelope', async () => {
    resendSendMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'Validation failed: tag value invalid' },
    });

    await expect(
      sendViaResend({
        to: 'user@example.com',
        from: 'hello@br360.example.com',
        subject: 'Subject',
        html: '<p>hi</p>',
        categories: ['password-reset'],
      }),
    ).rejects.toThrow('Validation failed: tag value invalid');
  });
});

