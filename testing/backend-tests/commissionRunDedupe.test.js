/**
 * Issue #928 -- one CommissionRun per consultant per period.
 *
 * A cron double-fire, a retry after a partial failure, or a manual trigger
 * in the same month as the cron must not create a second CommissionRun row
 * or queue a second statement email. The job now checks for an existing run
 * for (consultantId, periodStart) and skips cleanly; a unique-constraint
 * violation on the insert (concurrent runs racing) is treated as the same
 * clean skip. Migration 0025 adds the DB backstop.
 *
 * Control: the two skip tests fail against the pre-#928 job, which created a
 * row and queued an email unconditionally (verified by stashing the fix).
 */

import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";

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
const CommissionRunFindOne = jest.fn();
jest.unstable_mockModule("../../backend/src/models/CommissionRun.js", () => ({
  default: { create: CommissionRunCreate, findOne: CommissionRunFindOne },
}));

const enqueueTemplateEmail = jest.fn().mockResolvedValue({ success: true });
jest.unstable_mockModule("../../backend/src/services/emailQueueService.js", () => ({
  enqueueTemplateEmail,
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

const CONSULTANT = {
  id: "c1",
  referralCode: "REF1",
  userId: null,
  commissionRate: 0.3,
  firstName: "A",
};

describe("Issue #928 -- commission run per-period dedupe", () => {
  const originalKey = process.env.STRIPE_SECRET_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
    ConsultantFindAll.mockResolvedValue([CONSULTANT]);
    OrganizationFindAll.mockResolvedValue([]);
    subscriptionsList.mockResolvedValue({ data: [] });
    CommissionRunCreate.mockResolvedValue({ id: "run1", update: jest.fn() });
    enqueueTemplateEmail.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.STRIPE_SECRET_KEY;
    } else {
      process.env.STRIPE_SECRET_KEY = originalKey;
    }
  });

  it("skips a consultant whose period already has a run: no create, no email, no alert", async () => {
    CommissionRunFindOne.mockResolvedValue({ id: "existing-run" });

    await runCommissionJob({ triggeredBy: "manual" });

    expect(CommissionRunFindOne).toHaveBeenCalledTimes(1);
    expect(CommissionRunCreate).not.toHaveBeenCalled();
    expect(enqueueTemplateEmail).not.toHaveBeenCalled();
    expect(notifyError).not.toHaveBeenCalled();
  });

  it("treats a unique-constraint violation on create as a clean skip, not a consultant failure", async () => {
    CommissionRunFindOne.mockResolvedValue(null);
    const uniqueErr = new Error("duplicate key");
    uniqueErr.name = "SequelizeUniqueConstraintError";
    CommissionRunCreate.mockRejectedValue(uniqueErr);

    await runCommissionJob({ triggeredBy: "cron" });

    expect(CommissionRunCreate).toHaveBeenCalledTimes(1);
    expect(enqueueTemplateEmail).not.toHaveBeenCalled();
    // A skip is not a failure: the completed-with-errors alert must not fire.
    expect(notifyError).not.toHaveBeenCalled();
  });

  it("still creates the run and proceeds when no run exists for the period", async () => {
    CommissionRunFindOne.mockResolvedValue(null);

    await runCommissionJob({ triggeredBy: "cron" });

    expect(CommissionRunCreate).toHaveBeenCalledTimes(1);
    expect(notifyError).not.toHaveBeenCalled();
  });
});
