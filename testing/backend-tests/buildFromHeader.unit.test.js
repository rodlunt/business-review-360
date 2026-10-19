/**
 * Issue #645 — `buildFromHeader` composes the From-header value from a bare
 * address plus an optional EMAIL_FROM_NAME display name. Pre-quoted addresses
 * (`'Already Set <auth@x.au>'`) must pass through untouched. Display names
 * containing characters that require RFC 5322 quoting must be wrapped + escaped.
 */
import { describe, it, expect } from '@jest/globals';
import { buildFromHeader } from '../../backend/src/emails/utils/sendEmail.js';

describe('Issue #645 - buildFromHeader', () => {
  it('returns a bare address unchanged when no display name is provided', () => {
    expect(buildFromHeader('auth@x.au')).toBe('auth@x.au');
  });

  it('combines display name + address when both are provided', () => {
    expect(buildFromHeader('auth@x.au', 'Business Review 360')).toBe(
      'Business Review 360 <auth@x.au>',
    );
  });

  it('passes a pre-quoted address through untouched', () => {
    expect(
      buildFromHeader('Already Set <auth@x.au>', 'Ignored'),
    ).toBe('Already Set <auth@x.au>');
  });

  it('treats an empty display name as absent', () => {
    expect(buildFromHeader('auth@x.au', '')).toBe('auth@x.au');
    expect(buildFromHeader('auth@x.au', '   ')).toBe('auth@x.au');
  });

  it('quotes + escapes display names with RFC 5322 special chars', () => {
    expect(buildFromHeader('auth@x.au', 'Smith, Jones')).toBe(
      '"Smith, Jones" <auth@x.au>',
    );
    expect(buildFromHeader('auth@x.au', 'A "weird" name')).toBe(
      '"A \\"weird\\" name" <auth@x.au>',
    );
  });

  it('returns the address falsy-passthrough when missing', () => {
    expect(buildFromHeader('')).toBe('');
    expect(buildFromHeader(undefined)).toBe(undefined);
  });
});
