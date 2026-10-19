/**
 * Issue #494 - StorageAdapter abstraction.
 *
 * Covers the LocalStorageAdapter implementation and the createStorageAdapter
 * factory. The scaffold landed in commit 63e94bc with zero consumers and
 * zero tests; this file is the "tests" portion of #494. Consumer wiring
 * (multer integration in backend/src/middleware/upload.js plus the route
 * handlers that delete logos) is intentionally out of scope and tracked
 * separately.
 *
 * Each test uses a fresh per-run temp directory so the suite never touches
 * the real ./uploads tree on the host or in CI.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

import {
  LocalStorageAdapter,
  StorageAdapter,
  createStorageAdapter,
} from '../../backend/src/adapters/storage/index.js';

/**
 * Drain a readable stream to a Buffer. Used by the getStream test so we
 * can assert the bytes round-trip exactly.
 */
function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

describe('Issue #494 - LocalStorageAdapter', () => {
  let uploadsDir;
  let adapter;

  beforeEach(() => {
    uploadsDir = path.join(
      os.tmpdir(),
      `br360-storage-test-${crypto.randomUUID()}`
    );
    adapter = new LocalStorageAdapter({ uploadsDir });
  });

  afterEach(async () => {
    await fs.rm(uploadsDir, { recursive: true, force: true });
  });

  it('extends the StorageAdapter base class', () => {
    expect(adapter).toBeInstanceOf(StorageAdapter);
  });

  describe('save()', () => {
    it('writes the buffer to disk and returns a /uploads/<filename> URL', async () => {
      const filename = 'logo-123.png';
      const buffer = Buffer.from('fake-png-bytes');

      const result = await adapter.save(filename, buffer);

      expect(result).toEqual({
        url: '/uploads/logo-123.png',
        path: path.join(uploadsDir, 'logo-123.png'),
      });

      const onDisk = await fs.readFile(result.path);
      expect(onDisk.equals(buffer)).toBe(true);
    });

    it('creates the uploads directory if it does not exist yet', async () => {
      // beforeEach generates the path but never creates it; first save must
      // bring the directory into existence rather than ENOENT.
      await expect(fs.access(uploadsDir)).rejects.toThrow();

      await adapter.save('first.bin', Buffer.from([0x01, 0x02, 0x03]));

      await expect(fs.access(uploadsDir)).resolves.toBeUndefined();
    });

    it('honours a custom urlPrefix', async () => {
      const customAdapter = new LocalStorageAdapter({
        uploadsDir,
        urlPrefix: '/static/files',
      });

      const { url } = await customAdapter.save('a.txt', Buffer.from('hi'));

      expect(url).toBe('/static/files/a.txt');
    });
  });

  describe('delete()', () => {
    it('removes a previously saved file', async () => {
      const filename = 'gone.txt';
      const { path: target } = await adapter.save(
        filename,
        Buffer.from('bye')
      );
      await expect(fs.access(target)).resolves.toBeUndefined();

      await adapter.delete(filename);

      await expect(fs.access(target)).rejects.toThrow();
    });

    it('is idempotent: deleting a missing file does not throw', async () => {
      await adapter.ensureDir();

      await expect(adapter.delete('never-existed.txt')).resolves.toBeUndefined();
    });
  });

  describe('getUrl()', () => {
    it('returns /uploads/<filename> without performing IO', async () => {
      // The file does not exist on disk; getUrl must still resolve.
      const url = await adapter.getUrl('absent.png');

      expect(url).toBe('/uploads/absent.png');
    });
  });

  describe('getStream()', () => {
    it('returns a readable stream whose contents match what was saved', async () => {
      const filename = 'streamed.bin';
      const payload = Buffer.from('stream-me-back');
      await adapter.save(filename, payload);

      const stream = await adapter.getStream(filename);
      const drained = await streamToBuffer(stream);

      expect(drained.equals(payload)).toBe(true);
    });

    it('rejects when the file is missing rather than handing back a broken stream', async () => {
      await adapter.ensureDir();

      await expect(adapter.getStream('nope.bin')).rejects.toThrow();
    });
  });

  describe('exists()', () => {
    it('returns true for a file that has been saved', async () => {
      await adapter.save('here.txt', Buffer.from('present'));

      await expect(adapter.exists('here.txt')).resolves.toBe(true);
    });

    it('returns false for a file that has not been saved', async () => {
      await adapter.ensureDir();

      await expect(adapter.exists('missing.txt')).resolves.toBe(false);
    });
  });

  describe('path traversal guard (resolvePath)', () => {
    it('rejects save() with a parent-directory traversal filename', async () => {
      await expect(
        adapter.save('../evil.txt', Buffer.from('bad'))
      ).rejects.toThrow(/path separators/);
    });

    it('rejects delete() with a parent-directory traversal filename', async () => {
      await expect(adapter.delete('../evil.txt')).rejects.toThrow(
        /path separators/
      );
    });

    it('rejects getStream() with an absolute /etc/passwd-style filename', async () => {
      await expect(
        adapter.getStream('../etc/passwd')
      ).rejects.toThrow(/path separators/);
    });
  });
});

describe('Issue #494 - createStorageAdapter factory', () => {
  const originalProvider = process.env.STORAGE_PROVIDER;

  afterEach(() => {
    if (originalProvider === undefined) {
      delete process.env.STORAGE_PROVIDER;
    } else {
      process.env.STORAGE_PROVIDER = originalProvider;
    }
  });

  it('defaults to LocalStorageAdapter when STORAGE_PROVIDER is unset', () => {
    delete process.env.STORAGE_PROVIDER;

    const adapter = createStorageAdapter();

    expect(adapter).toBeInstanceOf(LocalStorageAdapter);
  });

  it('returns LocalStorageAdapter when STORAGE_PROVIDER=local', () => {
    process.env.STORAGE_PROVIDER = 'local';

    const adapter = createStorageAdapter();

    expect(adapter).toBeInstanceOf(LocalStorageAdapter);
  });

  it('throws "not yet implemented" for STORAGE_PROVIDER=azure-blob with the #495 reference', () => {
    process.env.STORAGE_PROVIDER = 'azure-blob';

    expect(() => createStorageAdapter()).toThrow(
      /not yet implemented.*#495/
    );
  });

  it('throws on an unknown provider value', () => {
    process.env.STORAGE_PROVIDER = 'gopher';

    expect(() => createStorageAdapter()).toThrow(/Unknown STORAGE_PROVIDER/);
  });

  it('passes constructor overrides through to the chosen adapter', () => {
    delete process.env.STORAGE_PROVIDER;
    const customDir = path.join(
      os.tmpdir(),
      `br360-factory-${crypto.randomUUID()}`
    );

    const adapter = createStorageAdapter({ uploadsDir: customDir });

    expect(adapter.uploadsDir).toBe(customDir);
  });
});
