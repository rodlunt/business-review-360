// Issue #705 - integration test for the logo upload + delete round-trip
// through the LocalStorageAdapter consumer wiring.
//
// Exercises the sequence a route handler now performs:
//   1. upload middleware sets req.file.filename (timestamp-prefixed)
//   2. route calls adapter.save(filename, buffer) to persist
//   3. old logo is removed via adapter.delete(filename)
//
// Uses a per-run temp directory so the host ./uploads tree is never touched.

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { LocalStorageAdapter } from '../../backend/src/adapters/storage/local.js';

// Minimal PNG magic bytes sufficient for identification.
const FAKE_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

describe('Issue #705 - logo upload + delete adapter round-trip', () => {
  let uploadsDir;
  let adapter;

  beforeEach(() => {
    uploadsDir = path.join(os.tmpdir(), `br360-logo-rt-${crypto.randomUUID()}`);
    adapter = new LocalStorageAdapter({ uploadsDir });
  });

  afterEach(async () => {
    await fs.rm(uploadsDir, { recursive: true, force: true });
  });

  it('save persists the buffer and returns a /uploads/<filename> URL', async () => {
    const filename = `${Date.now()}-company-logo.png`;

    const { url, path: target } = await adapter.save(filename, FAKE_PNG);

    expect(url).toBe(`/uploads/${filename}`);
    const onDisk = await fs.readFile(target);
    expect(onDisk.equals(FAKE_PNG)).toBe(true);
  });

  it('delete removes the previously saved file', async () => {
    const filename = `${Date.now()}-company-logo.png`;
    const { path: target } = await adapter.save(filename, FAKE_PNG);

    await adapter.delete(filename);

    await expect(fs.access(target)).rejects.toThrow();
  });

  it('logo replacement: old file deleted, new file present', async () => {
    // Simulate the route handler flow: save new logo, delete old logo.
    const oldFilename = `${Date.now()}-old-logo.png`;
    const newFilename = `${Date.now() + 1}-new-logo.png`;
    const newBuffer = Buffer.concat([FAKE_PNG, Buffer.from([0x00])]);

    const { path: oldPath } = await adapter.save(oldFilename, FAKE_PNG);
    const { path: newPath } = await adapter.save(newFilename, newBuffer);

    // Route handler deletes old logo using path.basename of the stored URL.
    const oldUrlFilename = path.basename(`/uploads/${oldFilename}`);
    await adapter.delete(oldUrlFilename);

    await expect(fs.access(oldPath)).rejects.toThrow();
    await expect(fs.access(newPath)).resolves.toBeUndefined();
  });

  it('delete is idempotent when old logo file is missing', async () => {
    await adapter.ensureDir();
    await expect(adapter.delete('never-existed.png')).resolves.toBeUndefined();
  });
});
