/**
 * Issue #815 / #735 regression -- the monthly commission cron must push a
 * ntfy alert when a run fails or completes incompletely, not just log.
 *
 * Background: commissionJob.js had the #735 silent-swallow pattern on a
 * financial path. A per-org Stripe error (fetchActiveSubscriptionAmount ->
 * stripe.subscriptions.list) is caught, logged, and the org is dropped from
 * the commission total. The run still "completes" with a smaller, wrong
 * number persisted to CommissionRun, and the consultant is silently
 * underpaid. The cron runs monthly, so the feedback loop is up to a month.
 *
 * This locks in:
 *  - a fatal run abort fires notifyError at priority 5;
 *  - a run that completes with per-consultant failures fires priority 4;
 *  - a run that completes with only per-org Stripe errors (consultantsFailed
 *    == 0) STILL fires priority 4 (the underpayment case);
 *  - a clean run does NOT alert.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";

// --- mocks --------------------------------------------------------------------

jest.unstable_mockModule("node-cron", () => ({
  default: { schedule: jest.fn().mockReturnValue({ stop: jest.fn() }) },
}));

const subscriptionsList = jest.fn();
jest.unstable_mockModule("stripe", () => ({
  default: jest.fn().mockImplementation(() => ({
    subscriptions: { list: subscriptionsList },
  })),
}));

const ConsultantFindAll = jest.fn();
jest.unstable_mockModule("../../backend/src/models/Consultant.js", () => ({
  default: { findAll: ConsultantFindAll },
}));

const OrganizationFindAll = jest.fn();
jest.unstable_mockModule("../../backend/src/models/Organization.js", () => ({
  default: { findAll: OrganizationFindAll },
}));

const CommissionRunCreate = jest.fn();
// findOne backs the per-period dedupe check added for #928; resolving null
// means "no existing run", the pre-#928 behaviour these tests assume.
const CommissionRunFindOne = jest.fn().mockResolvedValue(null);
jest.unstable_mockModule("../../backend/src/models/CommissionRun.js", () => ({
  default: { create: CommissionRunCreate, findOne: CommissionRunFindOne },
}));

jest.unstable_mockModule("../../backend/src/services/emailQueueService.js", () => ({
  enqueueTemplateEmail: jest.fn().mockResolvedValue({ success: true }),
  EmailPriority: { CRITICAL: 1, HIGH: 3, NORMAL: 5, LOW: 7, BATCH: 9 },
}));

// .jsx paths resolve to one module slot via moduleNameMapper; the factory
// must export every name the import chain needs.
jest.unstable_mockModule(
  "../../backend/src/emails/templates/consultants/ConsultantMonthlyStatementEmail.jsx",
  () => ({
    default: () => null,
    ConsultantMonthlyStatementEmail: () => null,
  })
);

jest.unstable_mockModule("../../backend/src/utils/logger.js", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  createLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

const notifyError = jest.fn().mockResolvedValue(undefined);
jest.unstable_mockModule("../../backend/src/utils/ntfy.js", () => ({
  notifyError,
  notifyEvent: jest.fn().mockResolvedValue(undefined),
}));

// Dynamic imports inside fetchActiveSubscriptionAmount.
jest.unstable_mockModule("../../backend/src/models/platformDatabase.js", () => ({
  platformSequelize: {
    query: jest.fn().mockResolvedValue([{ stripe_customer_id: "cus_1" }]),
  },
}));
jest.unstable_mockModule("sequelize", () => ({
  QueryTypes: { SELECT: "SELECT" },
}));
jest.unstable_mockModule("../../backend/src/models/User.js", () => ({
  default: { findOne: jest.fn().mockResolvedValue(null) },
}));

const { runCommissionJob } = await import("../../backend/src/jobs/commissionJob.js");

// --- tests --------------------------------------------------------------------

describe("Issue #815 -- commissionJob alerts on failed/incomplete runs", () => {
  const originalKey = process.env.STRIPE_SECRET_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
    subscriptionsList.mockResolvedValue({ data: [] });
    CommissionRunCreate.mockResolvedValue({ id: "run1", update: jest.fn() });
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.STRIPE_SECRET_KEY;
    } else {
      process.env.STRIPE_SECRET_KEY = originalKey;
    }
  });

  it("fires notifyError priority 5 when the whole run aborts", async () => {
    ConsultantFindAll.mockRejectedValue(new Error("db unreachable"));

    await runCommissionJob({ triggeredBy: "test" });

    expect(notifyError).toHaveBeenCalledTimes(1);
    const [title, body, opts] = notifyError.mock.calls[0];
    expect(title).toMatch(/FAILED/i);
    expect(body).toContain("db unreachable");
    expect(opts).toEqual(expect.objectContaining({ priority: 5 }));
  });

  it("fires notifyError priority 4 when a consultant fails", async () => {
    ConsultantFindAll.mockResolvedValue([
      { id: "c1", referralCode: "REF1", userId: null, commissionRate: 0.1, firstName: "A" },
    ]);
    OrganizationFindAll.mockRejectedValue(new Error("org query failed"));

    await runCommissionJob({ triggeredBy: "test" });

    expect(notifyError).toHaveBeenCalledTimes(1);
    const [title, , opts] = notifyError.mock.calls[0];
    expect(title).toMatch(/completed with errors/i);
    expect(opts).toEqual(expect.objectContaining({ priority: 4 }));
  });

  it("fires notifyError priority 4 on per-org Stripe error even when no consultant failed", async () => {
    ConsultantFindAll.mockResolvedValue([
      { id: "c1", referralCode: "REF1", userId: null, commissionRate: 0.1, firstName: "A" },
    ]);
    OrganizationFindAll.mockResolvedValue([
      { id: "o1", organizationId: "org-1", organizationName: "Org One" },
    ]);
    subscriptionsList.mockRejectedValue(new Error("stripe 503"));

    await runCommissionJob({ triggeredBy: "test" });

    expect(notifyError).toHaveBeenCalledTimes(1);
    const [title, body, opts] = notifyError.mock.calls[0];
    expect(title).toMatch(/completed with errors/i);
    expect(body).toContain("Org-level Stripe errors: 1");
    expect(opts).toEqual(expect.objectContaining({ priority: 4 }));
  });

  it("does NOT alert on a clean run", async () => {
    ConsultantFindAll.mockResolvedValue([]);

    await runCommissionJob({ triggeredBy: "test" });

    expect(notifyError).not.toHaveBeenCalled();
  });
});
