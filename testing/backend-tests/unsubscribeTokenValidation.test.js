/**
 * Unsubscribe token format validation
 *
 * Tokens are crypto.randomBytes(32).toString('base64url') — 43 chars of [A-Za-z0-9_-].
 * Before this fix, malformed tokens reached the DB lookup and could produce 500s.
 * After the fix, the route validates format first and returns 400 immediately.
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';

import { jest } from '@jest/globals';

const validateTokenMock = jest.fn();
const processUnsubscribeMock = jest.fn();
const processResubscribeMock = jest.fn();

jest.unstable_mockModule('../../backend/src/services/unsubscribeService.js', () => ({
  validateToken: validateTokenMock,
  processUnsubscribe: processUnsubscribeMock,
  processResubscribe: processResubscribeMock,
  getTypeDisplayName: jest.fn().mockReturnValue('Test Type'),
}));

jest.unstable_mockModule('../../backend/src/models/IdeaSubscription.js', () => ({
  default: { findOrCreate: jest.fn(), findOne: jest.fn() },
}));

jest.unstable_mockModule('../../backend/src/models/NotificationPreferences.js', () => ({
  default: { findOrCreate: jest.fn() },
}));

jest.unstable_mockModule('../../backend/src/utils/logger.js', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  createLogger: jest.fn(() => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() })),
}));

import { describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';

const { publicRouter } = await import('../../backend/src/routes/unsubscribe.js');

const app = express();
app.use(express.json());
app.use('/api/unsubscribe', publicRouter);

describe('Unsubscribe token format validation', () => {
  beforeEach(() => {
    validateTokenMock.mockClear();
    processUnsubscribeMock.mockClear();
    processResubscribeMock.mockClear();
  });

  // A valid base64url token is exactly 43 chars of [A-Za-z0-9_-]
  const GOOD_TOKEN = 'A'.repeat(43);

  const malformedTokens = [
    { label: 'too short', value: 'short' },
    { label: 'too long (500 chars)', value: 'a'.repeat(500) },
    { label: 'invalid characters', value: 'AAAA!AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' },
    { label: '42 chars (one short)', value: 'A'.repeat(42) },
    { label: '45 chars (two over)', value: 'A'.repeat(45) },
  ];

  describe('GET /:token — malformed tokens return 400 without hitting the service', () => {
    for (const { label, value } of malformedTokens) {
      it(`returns 400 for ${label}`, async () => {
        const res = await request(app).get(`/api/unsubscribe/${encodeURIComponent(value)}`);
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Invalid token');
        expect(validateTokenMock).not.toHaveBeenCalled();
      });
    }
  });

  describe('POST /:token — malformed tokens return 400 without hitting the service', () => {
    it('returns 400 for too-short token', async () => {
      const res = await request(app).post('/api/unsubscribe/short');
      expect(res.status).toBe(400);
      expect(processUnsubscribeMock).not.toHaveBeenCalled();
    });

    it('returns 400 for token with invalid characters', async () => {
      const res = await request(app).post('/api/unsubscribe/AAAA!AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
      expect(res.status).toBe(400);
      expect(processUnsubscribeMock).not.toHaveBeenCalled();
    });
  });

  describe('POST /:token/resubscribe — malformed tokens return 400 without hitting the service', () => {
    it('returns 400 for too-short token', async () => {
      const res = await request(app).post('/api/unsubscribe/short/resubscribe');
      expect(res.status).toBe(400);
      expect(processResubscribeMock).not.toHaveBeenCalled();
    });
  });

  describe('well-formed token passes format check and reaches the service', () => {
    it('GET with valid-format token calls validateToken', async () => {
      validateTokenMock.mockResolvedValue({ valid: false, error: 'Invalid token' });
      const res = await request(app).get(`/api/unsubscribe/${GOOD_TOKEN}`);
      expect(validateTokenMock).toHaveBeenCalledWith(GOOD_TOKEN);
      expect(res.status).toBe(400); // service says invalid, which is correct
    });

    it('POST with valid-format token calls processUnsubscribe', async () => {
      processUnsubscribeMock.mockResolvedValue({ valid: false, error: 'Invalid token' });
      const res = await request(app).post(`/api/unsubscribe/${GOOD_TOKEN}`);
      expect(processUnsubscribeMock).toHaveBeenCalledWith(GOOD_TOKEN);
      expect(res.status).toBe(400);
    });

    it('POST /resubscribe with valid-format token calls processResubscribe', async () => {
      processResubscribeMock.mockResolvedValue({ success: false, error: 'Invalid token' });
      const res = await request(app).post(`/api/unsubscribe/${GOOD_TOKEN}/resubscribe`);
      expect(processResubscribeMock).toHaveBeenCalledWith(GOOD_TOKEN);
      expect(res.status).toBe(400);
    });
  });
});
