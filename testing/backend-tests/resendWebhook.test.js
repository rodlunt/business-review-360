/**
 * Issue #572 -- Resend webhook receiver.
 *
 * Coverage targets, per the issue acceptance criteria:
 *
 *   1. Valid signature: each event type updates EmailLog correctly.
 *   2. Invalid signature: 400, no DB write.
 *   3. Missing signature header: 400, no DB write.
 *   4. Replay protection: stale timestamp returns 400.
 *   5. Unknown messageId: 200 (event might be a Resend test event).
 *   6. Idempotency: documented "no dedup" behaviour -- duplicate opens
 *      increment openCount; this test pins that contract so a future change
 *      forces a deliberate decision rather than a silent regression.
 *
 * Setup notes:
 *
 *   - The route mounts on POST /api/webhooks/resend with express.raw() so
 *     req.body remains a Buffer. We mirror that shape via supertest.
 *   - EmailLog is mocked at the module boundary; no real DB is required.
 *   - Signature is computed with the same crypto primitives the verifier
 *     uses, against the same dummy secret in backend/.env.test.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// EmailLog mock. Every test resets the mock implementations in beforeEach so
// each scenario can return a different row (or null) without leaking state.
// ---------------------------------------------------------------------------

const findOneMock = jest.fn();
jest.unstable_mockModule('../../backend/src/models/EmailLog.js', () => ({
  default: {
    findOne: findOneMock,
  },
}));

const { buildResendWebhookHandler, verifyResendSignature, applyResendEvent } = await import(
  '../../backend/src/routes/webhooks.js'
);

// The dummy secret in backend/.env.test base64-decodes to
// "test-resend-webhook-secret". The verifier accepts the value with or
// without the `whsec_` prefix.
const SECRET = 'whsec_dGVzdC1yZXNlbmQtd2ViaG9vay1zZWNyZXQ=';
process.env.RESEND_WEBHOOK_SECRET = SECRET;

/**
 * Build a signed Svix-style request body + headers for a given event payload.
 * Returns { rawBody, headers } where rawBody is the exact byte string the
 * server must verify against.
 */
function signEvent(eventPayload, { tsSeconds = Math.floor(Date.now() / 1000), id = 'msg_2RGW1q' } = {}) {
  // Sign the exact string supertest will transmit. Resend sends compact JSON
  // (no whitespace), so JSON.stringify with no space argument matches the
  // wire format the verifier sees.
  const rawBodyString = JSON.stringify(eventPayload);
  const rawBody = Buffer.from(rawBodyString, 'utf8');
  const rawSecret = SECRET.startsWith('whsec_') ? SECRET.slice('whsec_'.length) : SECRET;
  const secretBytes = Buffer.from(rawSecret, 'base64');
  const signedPayload = Buffer.concat([Buffer.from(`${id}.${tsSeconds}.`, 'utf8'), rawBody]);
  const signature = crypto.createHmac('sha256', secretBytes).update(signedPayload).digest('base64');
  return {
    rawBody,
    rawBodyString,
    headers: {
      'svix-id': id,
      'svix-timestamp': String(tsSeconds),
      'svix-signature': `v1,${signature}`,
      'content-type': 'application/json',
    },
  };
}

/**
 * Helper: post a pre-serialised body to the app. supertest serialises a
 * Buffer by JSON-stringifying it when content-type is application/json,
 * which would mutate the bytes the HMAC was computed over. Sending the
 * already-stringified body avoids that.
 */
function postSigned(app, signed) {
  const req = request(app).post('/api/webhooks/resend');
  for (const [k, v] of Object.entries(signed.headers)) req.set(k, v);
  return req.send(signed.rawBodyString);
}

/**
 * Build an express app with the webhook mounted exactly as index.js does.
 * Using express.raw is critical -- a JSON parser would mutate req.body and
 * break the HMAC check.
 */
function buildApp(handlerOptions) {
  const app = express();
  app.post(
    '/api/webhooks/resend',
    express.raw({ type: 'application/json' }),
    buildResendWebhookHandler(handlerOptions)
  );
  return app;
}

// ---------------------------------------------------------------------------
// Verifier unit tests -- exercise the pure HMAC path without express plumbing.
// ---------------------------------------------------------------------------

describe('verifyResendSignature', () => {
  it('accepts a correctly signed payload', () => {
    const { rawBody, headers } = signEvent({ type: 'email.delivered', data: { email_id: 'm1' } });
    const result = verifyResendSignature({
      secret: SECRET,
      svixId: headers['svix-id'],
      svixTimestamp: headers['svix-timestamp'],
      svixSignature: headers['svix-signature'],
      rawBody,
    });
    expect(result.ok).toBe(true);
  });

  it('rejects a payload signed with a different secret', () => {
    const { rawBody, headers } = signEvent({ type: 'email.delivered', data: { email_id: 'm1' } });
    const result = verifyResendSignature({
      secret: 'whsec_b3RoZXItc2VjcmV0LXZhbHVl',
      svixId: headers['svix-id'],
      svixTimestamp: headers['svix-timestamp'],
      svixSignature: headers['svix-signature'],
      rawBody,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('signature_mismatch');
  });

  it('rejects a stale timestamp outside the 5-minute window', () => {
    const stale = Math.floor(Date.now() / 1000) - 10 * 60;
    const { rawBody, headers } = signEvent({ type: 'email.delivered', data: { email_id: 'm1' } }, { tsSeconds: stale });
    const result = verifyResendSignature({
      secret: SECRET,
      svixId: headers['svix-id'],
      svixTimestamp: headers['svix-timestamp'],
      svixSignature: headers['svix-signature'],
      rawBody,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('timestamp_out_of_range');
  });

  it('rejects when any required header is missing', () => {
    const result = verifyResendSignature({
      secret: SECRET,
      svixId: 'msg_1',
      svixTimestamp: '0',
      svixSignature: '',
      rawBody: Buffer.from('{}'),
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('missing_headers');
  });

  it('accepts when the header carries multiple v1 signatures and one matches', () => {
    const { rawBody, headers } = signEvent({ type: 'email.delivered', data: { email_id: 'm1' } });
    // Prepend a deliberately-wrong v1 entry; the real one comes second.
    const multi = `v1,YWJjZA== ${headers['svix-signature']}`;
    const result = verifyResendSignature({
      secret: SECRET,
      svixId: headers['svix-id'],
      svixTimestamp: headers['svix-timestamp'],
      svixSignature: multi,
      rawBody,
    });
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Route-level tests -- full express plumbing including express.raw, with the
// EmailLog model mocked.
// ---------------------------------------------------------------------------

describe('POST /api/webhooks/resend', () => {
  beforeEach(() => {
    findOneMock.mockReset();
  });

  it('returns 400 when the signature is invalid', async () => {
    const app = buildApp();
    const payload = { type: 'email.delivered', data: { email_id: 'msg_1' } };
    const ts = Math.floor(Date.now() / 1000);
    const res = await request(app)
      .post('/api/webhooks/resend')
      .set('svix-id', 'msg_evt')
      .set('svix-timestamp', String(ts))
      .set('svix-signature', 'v1,deadbeefdeadbeefdeadbeefdeadbeef')
      .set('content-type', 'application/json')
      .send(Buffer.from(JSON.stringify(payload)));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_signature');
    expect(findOneMock).not.toHaveBeenCalled();
  });

  it('returns 400 when signature headers are missing', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/webhooks/resend')
      .set('content-type', 'application/json')
      .send(Buffer.from(JSON.stringify({ type: 'email.delivered', data: { email_id: 'm' } })));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_signature');
    expect(res.body.reason).toBe('missing_headers');
    expect(findOneMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the timestamp is outside the replay window', async () => {
    const app = buildApp();
    const stale = Math.floor(Date.now() / 1000) - 30 * 60;
    const signed = signEvent(
      { type: 'email.delivered', data: { email_id: 'm' } },
      { tsSeconds: stale }
    );
    const res = await postSigned(app, signed);
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe('timestamp_out_of_range');
    expect(findOneMock).not.toHaveBeenCalled();
  });

  it('returns 200 with matched=false when the messageId is unknown', async () => {
    findOneMock.mockResolvedValue(null);
    const app = buildApp();
    const signed = signEvent({
      type: 'email.delivered',
      data: { email_id: 'unknown-id' },
    });
    const res = await postSigned(app, signed);
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
    expect(res.body.matched).toBe(false);
  });

  it('end-to-end: a signed delivered event hits applyResendEvent through the full route', async () => {
    const row = {
      status: 'sent',
      deliveredAt: null,
      save: jest.fn().mockImplementation(async function s() {
        return this;
      }),
    };
    findOneMock.mockResolvedValue(row);
    const app = buildApp();
    const signed = signEvent({
      type: 'email.delivered',
      data: { email_id: 'msg_e2e' },
    });
    const res = await postSigned(app, signed);
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
    expect(res.body.applied).toBe(true);
    expect(row.status).toBe('delivered');
    expect(row.save).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Per-event-type behaviour. We exercise applyResendEvent directly to keep the
// assertions tight and avoid re-signing every payload.
// ---------------------------------------------------------------------------

function makeRow(initial = {}) {
  const row = {
    status: 'sent',
    deliveredAt: null,
    openedAt: null,
    clickedAt: null,
    bouncedAt: null,
    bounceType: null,
    bounceReason: null,
    spamReportedAt: null,
    openCount: 0,
    clickCount: 0,
    userAgent: null,
    ipAddress: null,
    metadata: null,
    ...initial,
    save: jest.fn().mockImplementation(async function save() {
      return this;
    }),
  };
  return row;
}

const silentLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

describe('applyResendEvent', () => {
  beforeEach(() => {
    findOneMock.mockReset();
  });

  it('marks delivered events with deliveredAt + status=delivered', async () => {
    const row = makeRow();
    findOneMock.mockResolvedValue(row);
    const result = await applyResendEvent(
      { type: 'email.delivered', data: { email_id: 'm1' } },
      silentLogger
    );
    expect(result).toEqual({ matched: true, applied: true, status: 'delivered' });
    expect(row.status).toBe('delivered');
    expect(row.deliveredAt).toBeInstanceOf(Date);
    expect(row.save).toHaveBeenCalledTimes(1);
  });

  it('marks first open with openedAt + openCount=1 and captures UA/IP', async () => {
    const row = makeRow({ status: 'delivered' });
    findOneMock.mockResolvedValue(row);
    const result = await applyResendEvent(
      {
        type: 'email.opened',
        data: { email_id: 'm1', user_agent: 'Mozilla/5.0', ip: '203.0.113.4' },
      },
      silentLogger
    );
    expect(result.applied).toBe(true);
    expect(row.status).toBe('opened');
    expect(row.openedAt).toBeInstanceOf(Date);
    expect(row.openCount).toBe(1);
    expect(row.userAgent).toBe('Mozilla/5.0');
    expect(row.ipAddress).toBe('203.0.113.4');
  });

  it('idempotency contract: duplicate opens DO increment openCount (no dedup)', async () => {
    const row = makeRow({ status: 'opened', openedAt: new Date('2026-01-01T00:00:00Z'), openCount: 1 });
    findOneMock.mockResolvedValue(row);
    await applyResendEvent({ type: 'email.opened', data: { email_id: 'm1' } }, silentLogger);
    expect(row.openCount).toBe(2);
    // openedAt should NOT be reset on a re-open.
    expect(row.openedAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('does not downgrade clicked -> opened when an open arrives after a click', async () => {
    const row = makeRow({ status: 'clicked', clickedAt: new Date(), clickCount: 1 });
    findOneMock.mockResolvedValue(row);
    await applyResendEvent({ type: 'email.opened', data: { email_id: 'm1' } }, silentLogger);
    expect(row.status).toBe('clicked');
    expect(row.openCount).toBe(1);
  });

  it('marks clicked events and increments clickCount', async () => {
    const row = makeRow({ status: 'opened', openedAt: new Date(), openCount: 1 });
    findOneMock.mockResolvedValue(row);
    await applyResendEvent(
      { type: 'email.clicked', data: { email_id: 'm1', user_agent: 'UA', ip: '203.0.113.5' } },
      silentLogger
    );
    expect(row.status).toBe('clicked');
    expect(row.clickedAt).toBeInstanceOf(Date);
    expect(row.clickCount).toBe(1);
  });

  it('records hard bounces with type="hard" and reason text', async () => {
    const row = makeRow({ status: 'sent' });
    findOneMock.mockResolvedValue(row);
    await applyResendEvent(
      {
        type: 'email.bounced',
        data: {
          email_id: 'm1',
          bounce: { subType: 'Permanent', message: 'address rejected' },
        },
      },
      silentLogger
    );
    expect(row.status).toBe('bounced');
    expect(row.bouncedAt).toBeInstanceOf(Date);
    expect(row.bounceType).toBe('hard');
    expect(row.bounceReason).toBe('address rejected');
  });

  it('records soft bounces with type="soft"', async () => {
    const row = makeRow();
    findOneMock.mockResolvedValue(row);
    await applyResendEvent(
      {
        type: 'email.bounced',
        data: { email_id: 'm1', bounce: { subType: 'Transient', message: 'mailbox full' } },
      },
      silentLogger
    );
    expect(row.bounceType).toBe('soft');
    expect(row.bounceReason).toBe('mailbox full');
  });

  it('records spam complaints', async () => {
    const row = makeRow({ status: 'delivered' });
    findOneMock.mockResolvedValue(row);
    const result = await applyResendEvent(
      { type: 'email.complained', data: { email_id: 'm1' } },
      silentLogger
    );
    expect(result.applied).toBe(true);
    expect(row.status).toBe('complained');
    expect(row.spamReportedAt).toBeInstanceOf(Date);
  });

  it('records delivery_delayed on metadata without changing status', async () => {
    const row = makeRow({ status: 'sent' });
    findOneMock.mockResolvedValue(row);
    await applyResendEvent(
      { type: 'email.delivery_delayed', data: { email_id: 'm1' } },
      silentLogger
    );
    expect(row.status).toBe('sent');
    expect(row.metadata).toBeTruthy();
    expect(typeof row.metadata.delayedAt).toBe('string');
  });

  it('treats email.sent as informational (no save)', async () => {
    const row = makeRow();
    findOneMock.mockResolvedValue(row);
    const result = await applyResendEvent(
      { type: 'email.sent', data: { email_id: 'm1' } },
      silentLogger
    );
    expect(result.applied).toBe(false);
    expect(row.save).not.toHaveBeenCalled();
  });

  it('returns matched=false when the row is missing', async () => {
    findOneMock.mockResolvedValue(null);
    const result = await applyResendEvent(
      { type: 'email.delivered', data: { email_id: 'unknown' } },
      silentLogger
    );
    expect(result.matched).toBe(false);
    expect(result.applied).toBe(false);
  });
});
