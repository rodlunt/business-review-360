/**
 * Issue #865 — `requireBulkInvitePlan` middleware tests.
 *
 * Pure middleware: no DB, no model imports. Only verifies branch logic for
 * tenant absence + plan whitelist matching (case-insensitive, env-driven).
 */
process.env.BULK_INVITE_ALLOWED_PLANS = "enterprise";

import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const { requireBulkInvitePlan } = await import("../../../backend/src/middleware/planLimits.js");

function mockRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

describe("requireBulkInvitePlan", () => {
  let next;
  let res;

  beforeEach(() => {
    next = jest.fn();
    res = mockRes();
  });

  it("returns 403 TENANT_REQUIRED when req.tenant is missing", () => {
    requireBulkInvitePlan({}, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "TENANT_REQUIRED" }));
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 PLAN_FEATURE_NOT_AVAILABLE for plans not in the allow-list", () => {
    requireBulkInvitePlan({ tenant: { plan: "sme", org_id: "demo-corp" } }, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    const body = res.json.mock.calls[0][0];
    expect(body.code).toBe("PLAN_FEATURE_NOT_AVAILABLE");
    expect(body.feature).toBe("bulk-staff-import");
    expect(body.plan).toBe("sme");
    expect(body.allowedPlans).toEqual(["enterprise"]);
    expect(body.upgradeUrl).toBe("/org/demo-corp/billing/upgrade");
    expect(next).not.toHaveBeenCalled();
  });

  it('also rejects "pro" (mid-tier) by default', () => {
    requireBulkInvitePlan({ tenant: { plan: "pro", org_id: "demo-corp" } }, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("passes through when plan is in the allow-list", () => {
    requireBulkInvitePlan({ tenant: { plan: "enterprise", org_id: "demo-corp" } }, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("is case-insensitive on the plan value", () => {
    requireBulkInvitePlan({ tenant: { plan: "ENTERPRISE", org_id: "demo-corp" } }, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("treats null/empty plan as not allowed (default-deny)", () => {
    requireBulkInvitePlan({ tenant: { plan: null, org_id: "demo-corp" } }, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
