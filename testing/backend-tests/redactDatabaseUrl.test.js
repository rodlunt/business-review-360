/**
 * Issue #541 regression guard.
 *
 * DATABASE_URL and PLATFORM_DATABASE_URL were previously logged with password
 * on every backend boot. `redactDatabaseUrl` must strip the password from any
 * postgres:// connection string while keeping the rest of the URL diagnosable
 * (user, host, port, database name, query parameters). This is the single
 * guard the boot logs rely on.
 */
import { describe, it, expect } from '@jest/globals';
import { redactDatabaseUrl } from '../../backend/src/utils/redactDatabaseUrl.js';

describe('Issue #541 - redactDatabaseUrl', () => {
  it('replaces the password in a standard postgres URL', () => {
    const input = 'postgres://app_user:s3cr3t@db.example.com:5432/br360';
    const output = redactDatabaseUrl(input);

    expect(output).not.toContain('s3cr3t');
    expect(output).toContain('app_user');
    expect(output).toContain('db.example.com');
    expect(output).toContain('5432');
    expect(output).toContain('br360');
    expect(output).toContain('***');
  });

  it('replaces the password in a postgresql:// URL', () => {
    const input = 'postgresql://postgres:hunter2@localhost:5432/postgres';
    const output = redactDatabaseUrl(input);

    expect(output).not.toContain('hunter2');
    expect(output).toContain('postgres');
    expect(output).toContain('localhost');
  });

  it('redacts a URL-encoded password', () => {
    const input = 'postgres://user:p%40ss%21word@host:5432/db';
    const output = redactDatabaseUrl(input);

    expect(output).not.toContain('p%40ss%21word');
    expect(output).not.toContain('p@ss!word');
    expect(output).toContain('user');
    expect(output).toContain('host');
  });

  it('keeps query parameters intact (e.g. sslmode)', () => {
    const input = 'postgres://app:secret@host:5432/db?sslmode=require';
    const output = redactDatabaseUrl(input);

    expect(output).not.toContain('secret');
    expect(output).toContain('sslmode=require');
  });

  it('returns a diagnosable placeholder when the input is empty', () => {
    expect(redactDatabaseUrl('')).toBe('(not set)');
    expect(redactDatabaseUrl(undefined)).toBe('(not set)');
    expect(redactDatabaseUrl(null)).toBe('(not set)');
  });

  it('returns a safe placeholder when the input is not a parseable URL', () => {
    const output = redactDatabaseUrl('not-a-url');

    // Must never echo the raw value (it could be a paste of a password alone).
    expect(output).not.toContain('not-a-url');
    expect(output).toContain('(unparseable');
  });

  it('handles a URL with no password (user only)', () => {
    const input = 'postgres://app_user@host:5432/db';
    const output = redactDatabaseUrl(input);

    expect(output).toContain('app_user');
    expect(output).toContain('host');
    // Nothing sensitive to leak; no need for *** marker.
  });
});
