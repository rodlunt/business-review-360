import { describe, it, expect } from "vitest";
import { shouldShowOrgPicker } from "./shouldShowOrgPicker";

const two = [{ organizationId: "a" }, { organizationId: "b" }];

describe("shouldShowOrgPicker (Phase 3 Slice 4)", () => {
  it("is false with no user", () => {
    expect(shouldShowOrgPicker({ user: null, memberships: two, picked: false })).toBe(false);
  });

  it("is false for a single-org user (locked decision #6)", () => {
    expect(
      shouldShowOrgPicker({
        user: { id: "u" },
        memberships: [{ organizationId: "a" }],
        picked: false,
      })
    ).toBe(false);
  });

  it("is true for a multi-org user who has not picked this session", () => {
    expect(shouldShowOrgPicker({ user: { id: "u" }, memberships: two, picked: false })).toBe(true);
  });

  it("is false once the user has picked this session", () => {
    expect(shouldShowOrgPicker({ user: { id: "u" }, memberships: two, picked: true })).toBe(false);
  });

  it("is false when memberships is missing or not an array", () => {
    expect(shouldShowOrgPicker({ user: { id: "u" }, memberships: undefined, picked: false })).toBe(
      false
    );
    expect(shouldShowOrgPicker({ user: { id: "u" }, memberships: null, picked: false })).toBe(
      false
    );
  });
});
