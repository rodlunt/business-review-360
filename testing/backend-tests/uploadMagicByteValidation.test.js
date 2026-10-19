// Unit tests for validateFileMagicBytes middleware.
//
// Covers the five scenarios called out in issue #498:
//   1. Matching Content-Type and correct magic bytes -> accepted.
//   2. Claimed image/jpeg but buffer is actually a PNG -> 415.
//   3. Claimed image/jpeg but buffer is plain text -> 415.
//   4. SVG with image/svg+xml Content-Type and real SVG content -> 415
//      (SVG is never accepted by the generic upload path).
//   5. Empty / unrecognisable buffer -> 415.
//
// We test the middleware directly with mock req/res/next rather than via
// supertest, because the rule we want to exercise lives entirely inside
// the middleware: route wiring is covered separately.

import { jest } from "@jest/globals";
import fs from "fs";
import os from "os";
import path from "path";
import { validateFileMagicBytes } from "../../backend/src/middleware/validateFileMagicBytes.js";

// Real magic-byte prefixes, long enough for file-type to identify.
const JPEG_MAGIC = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);
const PNG_MAGIC = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52,
]);
const PLAIN_TEXT = Buffer.from(
  "This is definitely not a JPEG, just some text.",
  "utf8"
);
const SVG_BODY = Buffer.from(
  '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>',
  "utf8"
);

// Helper: write a buffer to a temp file and return its path. The magic-byte
// middleware is path-driven (matches the diskStorage config used in
// production by upload.js), so tests hand it a real file on disk.
const writeTempFile = (buffer, suffix) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "br360-upload-test-"));
  const filePath = path.join(dir, `upload${suffix}`);
  fs.writeFileSync(filePath, buffer);
  return filePath;
};

// Helper: minimal mock response that records status + JSON body.
const makeRes = () => {
  const res = {
    statusCode: null,
    body: null,
  };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  return res;
};

// Helper: run the middleware and return { res, nextCalled, nextArg }.
const runMiddleware = async (file, options = {}) => {
  const req = file ? { file } : {};
  const res = makeRes();
  let nextCalled = false;
  let nextArg;
  const next = (err) => {
    nextCalled = true;
    nextArg = err;
  };
  await validateFileMagicBytes(options)(req, res, next);
  return { req, res, nextCalled, nextArg };
};

// Clean up any files we created during each test to keep /tmp tidy.
const tempFiles = [];
const trackedWrite = (buffer, suffix) => {
  const p = writeTempFile(buffer, suffix);
  tempFiles.push(p);
  return p;
};
afterEach(() => {
  while (tempFiles.length) {
    const p = tempFiles.pop();
    try {
      fs.unlinkSync(p);
    } catch {
      // already cleaned up (e.g. middleware unlinked it on rejection)
    }
    try {
      fs.rmdirSync(path.dirname(p));
    } catch {
      // dir may be gone already; harmless
    }
  }
});

describe("validateFileMagicBytes", () => {
  test("accepts a file whose Content-Type matches its magic bytes (JPEG)", async () => {
    const filePath = trackedWrite(JPEG_MAGIC, ".jpg");
    const { res, nextCalled, nextArg, req } = await runMiddleware({
      mimetype: "image/jpeg",
      path: filePath,
      size: JPEG_MAGIC.length,
      originalname: "real.jpg",
    });

    expect(nextCalled).toBe(true);
    expect(nextArg).toBeUndefined();
    expect(res.statusCode).toBeNull();
    expect(req.file.detectedMimeType).toBe("image/jpeg");
  });

  test("rejects a PNG buffer claiming Content-Type: image/jpeg (415)", async () => {
    const filePath = trackedWrite(PNG_MAGIC, ".jpg");
    const { res, nextCalled } = await runMiddleware({
      mimetype: "image/jpeg",
      path: filePath,
      size: PNG_MAGIC.length,
      originalname: "lying.jpg",
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(415);
    expect(res.body.error).toBe("Unsupported Media Type");
    expect(res.body.reason).toMatch(/does not match/i);
  });

  test("rejects plain text claiming Content-Type: image/jpeg (415)", async () => {
    const filePath = trackedWrite(PLAIN_TEXT, ".jpg");
    const { res, nextCalled } = await runMiddleware({
      mimetype: "image/jpeg",
      path: filePath,
      size: PLAIN_TEXT.length,
      originalname: "notes.jpg",
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(415);
    // Plain text has no known magic bytes, so file-type returns undefined.
    expect(res.body.reason).toMatch(/could not determine file type/i);
  });

  test("rejects an SVG with Content-Type: image/svg+xml even if its bytes are valid SVG (415)", async () => {
    const filePath = trackedWrite(SVG_BODY, ".svg");
    const { res, nextCalled } = await runMiddleware({
      mimetype: "image/svg+xml",
      path: filePath,
      size: SVG_BODY.length,
      originalname: "evil.svg",
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(415);
    expect(res.body.reason).toMatch(/svg/i);
    // The middleware must also unlink the rejected SVG so it can never be
    // served from /uploads.
    expect(fs.existsSync(filePath)).toBe(false);
  });

  test("rejects an empty file with no discernible magic bytes (415)", async () => {
    const filePath = trackedWrite(Buffer.alloc(0), ".jpg");
    const { res, nextCalled } = await runMiddleware({
      mimetype: "image/jpeg",
      path: filePath,
      size: 0,
      originalname: "empty.jpg",
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(415);
    expect(res.body.reason).toMatch(/empty|could not determine/i);
  });

  test("also works when multer uses memoryStorage (req.file.buffer path)", async () => {
    // Regression guard: if a future route switches to memoryStorage, the
    // middleware must still enforce magic-byte validation from the buffer.
    const { res, nextCalled, req } = await runMiddleware({
      mimetype: "image/png",
      buffer: PNG_MAGIC,
      size: PNG_MAGIC.length,
      originalname: "real.png",
    });

    expect(nextCalled).toBe(true);
    expect(res.statusCode).toBeNull();
    expect(req.file.detectedMimeType).toBe("image/png");
  });

  test("rejects an SVG payload that claims a different mimetype", async () => {
    // Defence-in-depth: attacker uploads `<svg><script>` bytes but claims
    // image/jpeg to slip past the mimetype check in upload.js. The
    // SVG/XML pre-check must still catch it.
    const filePath = trackedWrite(SVG_BODY, ".jpg");
    const { res, nextCalled } = await runMiddleware({
      mimetype: "image/jpeg",
      path: filePath,
      size: SVG_BODY.length,
      originalname: "evil.jpg",
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(415);
    expect(res.body.reason).toMatch(/svg|xml/i);
  });
});
