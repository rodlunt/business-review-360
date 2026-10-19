import { describe, it, expect } from "vitest";
import { resolveLoginResponse } from "./resolveLoginResponse";

describe("resolveLoginResponse (Phase 5 Slice 5b org-less login classification)", () => {
  it("classifies the org-scoped / single-org authed shape", () => {
    const user = { id: "u1", username: "alice", organizationId: "demo-corp" };
    expect(resolveLoginResponse({ token: "jwt.abc", user })).toEqual({
      kind: "authed",
      user,
    });
  });

  it("classifies the multi-org pick shape", () => {
    const memberships = [
      { organizationId: "a", orgName: "Org A", isAdmin: true, isSuperuser: false },
      { organizationId: "b", orgName: "Org B", isAdmin: false, isSuperuser: false },
    ];
    expect(
      resolveLoginResponse({
        pickToken: "pick.jwt",
        multiOrg: true,
        primaryOrganizationId: "b",
        memberships,
      })
    ).toEqual({
      kind: "pick",
      pickToken: "pick.jwt",
      memberships,
      primaryOrganizationId: "b",
    });
  });

  it("defaults a missing primaryOrganizationId to null on the pick shape", () => {
    const res = resolveLoginResponse({
      pickToken: "pick.jwt",
      multiOrg: true,
      memberships: [{ organizationId: "a", orgName: "Org A" }],
    });
    expect(res.kind).toBe("pick");
    expect(res.primaryOrganizationId).toBe(null);
  });

  it("coerces a missing/non-array memberships list to [] on the pick shape", () => {
    const res = resolveLoginResponse({ pickToken: "pick.jwt", multiOrg: true });
    expect(res.kind).toBe("pick");
    expect(res.memberships).toEqual([]);
  });

  it("treats multiOrg without a pickToken as unknown (fails closed, no session)", () => {
    expect(resolveLoginResponse({ multiOrg: true, memberships: [] })).toEqual({
      kind: "unknown",
    });
  });

  it("treats a truthy-but-non-true multiOrg as unknown (strict === true)", () => {
    // Defensive: only an explicit boolean true is the multi-org contract.
    expect(resolveLoginResponse({ multiOrg: "yes", pickToken: "x" })).toEqual({
      kind: "unknown",
    });
  });

  it("treats a token without a user as unknown (half-formed, fail closed)", () => {
    expect(resolveLoginResponse({ token: "jwt.abc" })).toEqual({ kind: "unknown" });
  });

  it("treats a user without a token as unknown (half-formed, fail closed)", () => {
    expect(resolveLoginResponse({ user: { id: "u1" } })).toEqual({ kind: "unknown" });
  });

  it("treats null / undefined / empty bodies as unknown", () => {
    expect(resolveLoginResponse(null)).toEqual({ kind: "unknown" });
    expect(resolveLoginResponse(undefined)).toEqual({ kind: "unknown" });
    expect(resolveLoginResponse({})).toEqual({ kind: "unknown" });
  });

  it("prefers the authed shape when a body somehow carries both", () => {
    // Should never happen from the backend, but the authed branch is
    // checked first and a real session token wins deterministically.
    const user = { id: "u1", organizationId: "demo-corp" };
    expect(resolveLoginResponse({ token: "jwt", user, multiOrg: true, pickToken: "p" })).toEqual({
      kind: "authed",
      user,
    });
  });
});
