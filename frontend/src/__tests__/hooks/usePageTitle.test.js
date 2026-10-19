import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePageTitle } from "../../hooks/usePageTitle";

const SUFFIX = "Business Review 360";

describe("usePageTitle", () => {
  beforeEach(() => {
    document.title = "reset";
  });

  it("appends the BR360 suffix when given a title", () => {
    renderHook(() => usePageTitle("Submit Idea"));
    expect(document.title).toBe(`Submit Idea | ${SUFFIX}`);
  });

  it("falls back to the bare suffix when title is undefined", () => {
    renderHook(() => usePageTitle());
    expect(document.title).toBe(SUFFIX);
  });

  it("falls back to the bare suffix when title is an empty string", () => {
    renderHook(() => usePageTitle(""));
    expect(document.title).toBe(SUFFIX);
  });

  it("falls back to the bare suffix when title is null", () => {
    renderHook(() => usePageTitle(null));
    expect(document.title).toBe(SUFFIX);
  });

  it("updates document.title when the title prop changes", () => {
    const { rerender } = renderHook(({ title }) => usePageTitle(title), {
      initialProps: { title: "First Page" },
    });
    expect(document.title).toBe(`First Page | ${SUFFIX}`);

    rerender({ title: "Second Page" });
    expect(document.title).toBe(`Second Page | ${SUFFIX}`);
  });

  it("handles dynamic data with a fallback (idea title example)", () => {
    const { rerender } = renderHook(({ t }) => usePageTitle(t || "Idea"), {
      initialProps: { t: undefined },
    });
    // Loading state: data not yet present, hook gets the fallback
    expect(document.title).toBe(`Idea | ${SUFFIX}`);

    rerender({ t: "Improve onboarding" });
    expect(document.title).toBe(`Improve onboarding | ${SUFFIX}`);
  });
});
