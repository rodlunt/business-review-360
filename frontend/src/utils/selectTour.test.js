import { describe, it, expect } from "vitest";
import { selectTour } from "./selectTour";

describe("selectTour (Phase 3 Slice 2 tour gating)", () => {
  it("returns null when there is no user", () => {
    expect(selectTour(null)).toBe(null);
    expect(selectTour(undefined)).toBe(null);
  });

  it("shows the superuser tour for an unseen superuser", () => {
    expect(selectTour({ isSuperuser: true, isAdmin: true })).toBe("superuser");
  });

  it("suppresses the superuser tour once the server flag is set", () => {
    expect(
      selectTour({ isSuperuser: true, isAdmin: true, hasSeenSuperuserWalkthrough: true })
    ).toBe(null);
  });

  it("shows the admin tour for an unseen non-superuser admin", () => {
    expect(selectTour({ isAdmin: true, isSuperuser: false })).toBe("admin");
  });

  it("superuser precedence wins over admin", () => {
    // A superuser is also isAdmin; must get the superuser tour, not admin.
    expect(selectTour({ isSuperuser: true, isAdmin: true })).toBe("superuser");
  });

  it("suppresses the admin tour once its flag is set", () => {
    expect(selectTour({ isAdmin: true, isSuperuser: false, hasSeenAdminWalkthrough: true })).toBe(
      null
    );
  });

  it("shows the user tour for an unseen plain user", () => {
    expect(selectTour({ isAdmin: false })).toBe("user");
  });

  it("suppresses the user tour once its flag is set", () => {
    expect(selectTour({ isAdmin: false, hasSeenUserWalkthrough: true })).toBe(null);
  });

  it("never shows a tour to an anonymous user", () => {
    expect(selectTour({ isAdmin: false, isAnonymous: true })).toBe(null);
  });

  it("a brand-new user (no flags) sees their role tour", () => {
    expect(selectTour({ isAdmin: true, isSuperuser: false })).toBe("admin");
    expect(selectTour({ isAdmin: false })).toBe("user");
  });
});
