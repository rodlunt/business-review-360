/**
 * Issue #738 -- EmailQueue failure-persistence acceptance test.
 *
 * Acceptance criterion (from the issue body):
 *   "A test asserts that a Resend send failure persists
 *    EmailQueue.status='failed' with a non-null error column after the
 *    retry budget is exhausted."
 *
 * The transactional silent-swallow problem #738 fixes is structural: every
 * send path used to log + return success on Resend errors, with no durable
 * record. Routing through enqueueTemplateEmail is only half the fix; the
 * other half is that the queue worker MUST mark a row `failed` (not silently
 * keep retrying forever or mark it `sent`) once attempts exhaust maxAttempts.
 *
 * This test mocks the EmailQueue model + sendRawEmail to keep the
 * exercise hermetic. It asserts the contract that handleSendFailure (private)
 * implements via the public processQueue surface.
 *
 * Two additional tests cover the new enqueueTemplateEmail helper:
 *   - happy path: render + enqueue returns {success: true, queueId}
 *   - render failure: returns {success: false, error: 'render failed: ...'}
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// --- mocks must be registered BEFORE the service is imported ---------------

const findAllMock = jest.fn();
const createMock = jest.fn();
const updateMock = jest.fn().mockResolvedValue([0]);
const sequelizeFnMock = jest.fn();
// #745: processQueue + batchDigestEmails wrap claim/cancel work in a
// transaction. The mock just runs the callback through with a fake `tx`
// object exposing `LOCK.UPDATE`. The lock semantics themselves are
// covered by the testcontainers integration test, not this hermetic
// unit test.
const sequelizeTransactionMock = jest.fn(async (fn) =>
  fn({ LOCK: { UPDATE: 'UPDATE' } })
);

jest.unstable_mockModule('../../backend/src/models/EmailQueue.js', () => ({
  default: {
    findAll: findAllMock,
    create: createMock,
    findOne: jest.fn(),
    findByPk: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    destroy: jest.fn().mockResolvedValue(0),
    update: updateMock,
    bulkCreate: jest.fn().mockResolvedValue([]),
    sequelize: {
      fn: sequelizeFnMock,
      transaction: sequelizeTransactionMock,
    },
  },
}));

const emailLogCreateMock = jest.fn().mockResolvedValue({});
jest.unstable_mockModule('../../backend/src/models/EmailLog.js', () => ({
  default: {
    create: emailLogCreateMock,
    count: jest.fn().mockResolvedValue(0),
  },
}));

jest.unstable_mockModule('../../backend/src/models/User.js', () => ({
  default: { findByPk: jest.fn().mockResolvedValue(null) },
}));

const sendRawEmailMock = jest.fn();
jest.unstable_mockModule('../../backend/src/emails/utils/sendEmail.js', () => ({
  sendRawEmail: sendRawEmailMock,
  sendTemplateEmail: jest.fn(),
}));

const renderEmailMock = jest.fn();
jest.unstable_mockModule('../../backend/src/emails/utils/renderEmail.js', () => ({
  renderEmail: renderEmailMock,
}));

jest.unstable_mockModule('../../backend/src/utils/notificationChecker.js', () => ({
  shouldSendNotification: jest.fn().mockResolvedValue(true),
  getEmailFrequency: jest.fn().mockResolvedValue('immediate'),
  NotificationType: {},
}));

// #744: processQueue resolves the row's tenant up-front and wraps the row's
// work in withTenantContext. Mock both so the test stays hermetic and does
// not need a real platform DB or transaction-capable Sequelize.
jest.unstable_mockModule('../../backend/src/middleware/tenantResolver.js', () => ({
  getTenantByOrganizationId: jest.fn().mockResolvedValue({
    id: '00000000-0000-0000-0000-000000000001',
    org_id: 'demo-corp',
    tenant_name: 'Demo Corp',
    plan: 'starter',
    status: 'active',
    limits: {},
  }),
  resolveTenant: jest.fn(),
  requireTenant: jest.fn(),
  clearTenantCache: jest.fn(),
  getTenantCacheStats: jest.fn(),
}));

jest.unstable_mockModule('../../backend/src/utils/withTenantContext.js', () => ({
  withTenantContext: jest.fn(async (_tenantId, fn) => fn()),
}));

const {
  enqueueTemplateEmail,
  processQueue,
  EmailPriority,
} = await import('../../backend/src/services/emailQueueService.js');

// --- helpers ---------------------------------------------------------------

/**
 * Build a fake EmailQueue row with a stub `update` so processQueue's
 * `await email.update({...})` calls are observable. The fake row mutates
 * its own attempts/status on update so subsequent loop iterations of the
 * retry budget see the new state, matching real Sequelize behaviour.
 */
function makeFakeQueueRow({ attempts = 0, maxAttempts = 3 } = {}) {
  const row = {
    id: 'queue-row-1',
    userId: null,
    organizationId: 'demo-corp',
    type: 'password-reset',
    to: 'user@example.com',
    subject: 'Test',
    data: { html: '<p>x</p>', text: 'x', categories: ['password-reset', 'demo-corp'] },
    priority: EmailPriority.CRITICAL,
    scheduledFor: new Date(0), // any past date so isReady() passes
    attempts,
    maxAttempts,
    status: 'pending',
    update: jest.fn(async (patch) => {
      Object.assign(row, patch);
      return row;
    }),
    getNextRetryTime: () => new Date(Date.now() + 60_000),
  };
  return row;
}

// --- tests -----------------------------------------------------------------

describe('Issue #738 -- EmailQueue failure budget persistence', () => {
  beforeEach(() => {
    sendRawEmailMock.mockReset();
    renderEmailMock.mockReset();
    findAllMock.mockReset();
    createMock.mockReset();
    emailLogCreateMock.mockClear();
  });

  it('marks status=failed with a non-null error after maxAttempts is exhausted', async () => {
    const row = makeFakeQueueRow({ attempts: 2, maxAttempts: 3 });
    findAllMock.mockResolvedValueOnce([row]);

    sendRawEmailMock.mockResolvedValueOnce({
      success: false,
      error: 'Resend 401 unauthorized',
    });

    const result = await processQueue(50);

    expect(result.failed).toBe(1);
    expect(result.sent).toBe(0);

    // Two updates expected: status='sending' then status='failed'.
    const failedUpdate = row.update.mock.calls.find(
      ([patch]) => patch.status === 'failed',
    );
    expect(failedUpdate).toBeDefined();
    expect(failedUpdate[0]).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('Resend 401'),
      attempts: 3,
    });

    // EmailLog row must also record the failure for observability queries.
    expect(emailLogCreateMock).toHaveBeenCalled();
    const logArgs = emailLogCreateMock.mock.calls[0][0];
    expect(logArgs).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('Resend 401'),
    });
  });

  it('reschedules (status=pending, error set) on a transient failure when attempts < maxAttempts', async () => {
    const row = makeFakeQueueRow({ attempts: 0, maxAttempts: 3 });
    findAllMock.mockResolvedValueOnce([row]);

    sendRawEmailMock.mockResolvedValueOnce({
      success: false,
      error: 'Resend 503 service unavailable',
    });

    const result = await processQueue(50);

    expect(result.failed).toBe(1);

    // The row should NOT be marked failed yet; it should be re-pending with
    // the error captured for the next attempt to surface.
    const reschedule = row.update.mock.calls.find(
      ([patch]) => patch.status === 'pending' && patch.error,
    );
    expect(reschedule).toBeDefined();
    expect(reschedule[0]).toMatchObject({
      status: 'pending',
      error: expect.stringContaining('503'),
      attempts: 1,
    });
    expect(row.status).toBe('pending');
  });
});

describe('Issue #738 -- enqueueTemplateEmail helper', () => {
  beforeEach(() => {
    sendRawEmailMock.mockReset();
    renderEmailMock.mockReset();
    findAllMock.mockReset();
    createMock.mockReset();
  });

  it('renders the template, enqueues with html/text/categories/replyTo, returns {success:true, queueId}', async () => {
    renderEmailMock.mockResolvedValueOnce({
      html: '<p>hello</p>',
      text: 'hello',
    });
    createMock.mockResolvedValueOnce({ id: 'queue-row-xyz' });

    const result = await enqueueTemplateEmail({
      to: 'user@example.com',
      subject: 'Welcome',
      template: () => null,
      templateProps: { userName: 'Pat' },
      categories: ['welcome', 'demo-corp'],
      replyTo: 'reply@example.com',
      type: 'welcome',
      priority: EmailPriority.NORMAL,
      organizationId: 'demo-corp',
    });

    expect(result).toEqual({ success: true, queueId: 'queue-row-xyz' });

    const createArgs = createMock.mock.calls[0][0];
    expect(createArgs).toMatchObject({
      organizationId: 'demo-corp',
      type: 'welcome',
      to: 'user@example.com',
      subject: 'Welcome',
      priority: EmailPriority.NORMAL,
      status: 'pending',
    });
    expect(createArgs.data).toEqual({
      html: '<p>hello</p>',
      text: 'hello',
      categories: ['welcome', 'demo-corp'],
      replyTo: 'reply@example.com',
    });
  });

  it('returns {success:false, error} when render throws', async () => {
    renderEmailMock.mockRejectedValueOnce(new Error('jsx blew up'));

    const result = await enqueueTemplateEmail({
      to: 'user@example.com',
      subject: 'Welcome',
      template: () => null,
      templateProps: {},
      type: 'welcome',
      organizationId: 'demo-corp',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('render failed');
    expect(result.error).toContain('jsx blew up');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('returns {success:false} when type is missing (guard against silent enqueue)', async () => {
    const result = await enqueueTemplateEmail({
      to: 'user@example.com',
      subject: 'Welcome',
      template: () => null,
      organizationId: 'demo-corp',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/type is required/);
    expect(renderEmailMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe('Issue #745 -- processQueue claim semantics', () => {
  beforeEach(() => {
    findAllMock.mockReset();
    updateMock.mockClear();
    sequelizeTransactionMock.mockClear();
    sendRawEmailMock.mockReset();
    emailLogCreateMock.mockClear();
  });

  it('claims pending rows inside a transaction with FOR UPDATE SKIP LOCKED options', async () => {
    findAllMock.mockResolvedValueOnce([]); // empty claim, nothing to process

    await processQueue(50);

    // The claim runs inside sequelize.transaction(...).
    expect(sequelizeTransactionMock).toHaveBeenCalledTimes(1);

    // findAll was called with the lock + skipLocked + transaction options.
    expect(findAllMock).toHaveBeenCalledTimes(1);
    const [findAllOpts] = findAllMock.mock.calls[0];
    expect(findAllOpts).toMatchObject({
      lock: 'UPDATE',
      skipLocked: true,
      limit: 50,
    });
    expect(findAllOpts.transaction).toBeDefined();
    expect(findAllOpts.where).toMatchObject({ status: 'pending' });
  });

  it('moves claimed rows to status=sending inside the same transaction before processing', async () => {
    const row = makeFakeQueueRow({ attempts: 0, maxAttempts: 3 });
    findAllMock.mockResolvedValueOnce([row]);
    sendRawEmailMock.mockResolvedValueOnce({
      success: true,
      messageId: 'resend-id-123',
    });

    await processQueue(10);

    // The bulk update inside the claim tx flips the claimed rows to
    // 'sending' BEFORE the per-row send loop runs. Concurrent workers
    // see them as no-longer-pending after this commit.
    const sendingUpdate = updateMock.mock.calls.find(
      ([patch]) => patch.status === 'sending',
    );
    expect(sendingUpdate).toBeDefined();
    expect(sendingUpdate[1]).toMatchObject({ transaction: expect.anything() });
    // The bulk update should target the claimed row id specifically.
    expect(sendingUpdate[1].where).toBeDefined();
  });
});
