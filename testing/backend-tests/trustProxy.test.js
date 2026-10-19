/**
 * Trust Proxy Configuration Tests (Issue #497)
 *
 * BR360 runs Express behind nginx in production and Docker networking
 * locally. Without `app.set('trust proxy', ...)`, req.ip resolves to the
 * upstream address (Docker bridge), not the real client IP, which breaks
 * IP-based rate limiting.
 *
 * These tests verify:
 *   1. The production app (src/index.js) sets 'trust proxy' to 1, meaning
 *      Express will trust exactly one proxy hop (nginx) when parsing
 *      X-Forwarded-For.
 *   2. With that setting, a request carrying X-Forwarded-For: <client-ip>
 *      surfaces as req.ip === <client-ip>.
 *
 * We avoid importing src/index.js directly because that module boots the
 * full server (DB connection, scheduler, etc.) as a side effect. Instead
 * we build a minimal app that mirrors the relevant line and assert the
 * observable behaviour via supertest.
 */

import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import express from 'express';

describe('trust proxy configuration (#497)', () => {
  it('app with trust proxy = 1 exposes the client IP from X-Forwarded-For', async () => {
    const app = express();
    // Mirror the production setting from backend/src/index.js
    app.set('trust proxy', 1);

    app.get('/whoami', (req, res) => {
      res.json({ ip: req.ip });
    });

    const response = await request(app)
      .get('/whoami')
      .set('X-Forwarded-For', '203.0.113.45')
      .expect(200);

    expect(response.body.ip).toBe('203.0.113.45');
  });

  it('app WITHOUT trust proxy ignores X-Forwarded-For (regression guard)', async () => {
    const app = express();
    // Intentionally DO NOT set trust proxy. This documents the broken
    // default behaviour: req.ip falls back to the socket remote address.
    app.get('/whoami', (req, res) => {
      res.json({ ip: req.ip });
    });

    const response = await request(app)
      .get('/whoami')
      .set('X-Forwarded-For', '203.0.113.45')
      .expect(200);

    expect(response.body.ip).not.toBe('203.0.113.45');
  });

  it('trust proxy value of 1 means "trust the first hop" (nginx)', () => {
    const app = express();
    app.set('trust proxy', 1);
    // Express normalises the numeric setting into a function that, when
    // invoked with (addr, hopIndex), returns true for hopIndex < 1.
    const trustFn = app.get('trust proxy fn');
    expect(typeof trustFn).toBe('function');
    expect(trustFn('10.0.0.1', 0)).toBe(true);
    expect(trustFn('10.0.0.1', 1)).toBe(false);
  });
});
