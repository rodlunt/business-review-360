import { describe, it, expect } from "vitest";
import { resumeStep } from "./resumeStep";

describe("resumeStep (step-position resume for the Shepherd tours)", () => {
  it("returns the saved step for a matching type", () => {
    expect(resumeStep({ superuserWalkthroughStep: 3 }, "superuser")).toBe(3);
    expect(resumeStep({ adminWalkthroughStep: 2 }, "admin")).toBe(2);
    expect(resumeStep({ userWalkthroughStep: 1 }, "user")).toBe(1);
  });

  it("returns 0 when the saved step is null", () => {
    expect(resumeStep({ superuserWalkthroughStep: null }, "superuser")).toBe(0);
  });

  it("returns 0 when the saved step is missing", () => {
    expect(resumeStep({}, "admin")).toBe(0);
  });

  it("returns 0 when there is no user", () => {
    expect(resumeStep(null, "user")).toBe(0);
    expect(resumeStep(undefined, "user")).toBe(0);
  });

  it("returns 0 for an unknown tour type", () => {
    expect(resumeStep({ adminWalkthroughStep: 4 }, "bogus")).toBe(0);
  });

  it("returns 0 for a non-integer or negative saved step", () => {
    expect(resumeStep({ adminWalkthroughStep: -1 }, "admin")).toBe(0);
    expect(resumeStep({ adminWalkthroughStep: 1.5 }, "admin")).toBe(0);
    expect(resumeStep({ adminWalkthroughStep: "3" }, "admin")).toBe(0);
  });

  it("each type reads its own field and ignores the others", () => {
    const user = {
      superuserWalkthroughStep: 5,
      adminWalkthroughStep: 2,
      userWalkthroughStep: 1,
    };
    expect(resumeStep(user, "superuser")).toBe(5);
    expect(resumeStep(user, "admin")).toBe(2);
    expect(resumeStep(user, "user")).toBe(1);
  });
});
