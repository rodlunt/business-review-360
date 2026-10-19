import { describe, it, expect } from "vitest";
import { nextOnboardingStep } from "./onboardingStep";

const twoOrgs = [{ organizationId: "a" }, { organizationId: "b" }];
const oneOrg = [{ organizationId: "a" }];

describe("nextOnboardingStep (Phase 3 Slice 5 ordered sequence)", () => {
  it("is done with no user", () => {
    expect(
      nextOnboardingStep({ user: null, memberships: twoOrgs, orgPicked: false, welcomeSeen: false })
    ).toBe("done");
  });

  it("org picker comes first for a multi-org user who has not picked", () => {
    expect(
      nextOnboardingStep({
        user: { id: "u", isAdmin: false },
        memberships: twoOrgs,
        orgPicked: false,
        welcomeSeen: false,
      })
    ).toBe("orgPicker");
  });

  it("org picker precedes welcome even if welcome was already seen", () => {
    expect(
      nextOnboardingStep({
        user: { id: "u" },
        memberships: twoOrgs,
        orgPicked: false,
        welcomeSeen: true,
      })
    ).toBe("orgPicker");
  });

  it("welcome follows once the org is picked", () => {
    expect(
      nextOnboardingStep({
        user: { id: "u", isAdmin: false },
        memberships: twoOrgs,
        orgPicked: true,
        welcomeSeen: false,
      })
    ).toBe("welcome");
  });

  it("a single-org user skips the picker and goes straight to welcome", () => {
    expect(
      nextOnboardingStep({
        user: { id: "u", isAdmin: false },
        memberships: oneOrg,
        orgPicked: false,
        welcomeSeen: false,
      })
    ).toBe("welcome");
  });

  it("the role tour follows the welcome for a first-login user", () => {
    expect(
      nextOnboardingStep({
        user: { id: "u", isAdmin: true, isSuperuser: false },
        memberships: oneOrg,
        orgPicked: false,
        welcomeSeen: true,
      })
    ).toBe("tour");
  });

  it("is done once welcome is seen and the role tour flag is set", () => {
    expect(
      nextOnboardingStep({
        user: { id: "u", isAdmin: true, isSuperuser: false, hasSeenAdminWalkthrough: true },
        memberships: oneOrg,
        orgPicked: false,
        welcomeSeen: true,
      })
    ).toBe("done");
  });
});
