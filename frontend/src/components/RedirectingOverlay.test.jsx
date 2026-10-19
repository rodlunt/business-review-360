import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import RedirectingOverlay from "./RedirectingOverlay";

describe("RedirectingOverlay (Issue #836)", () => {
  it("renders nothing when visible is false (default)", () => {
    const { container } = render(<RedirectingOverlay />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the overlay and label when visible is true", () => {
    render(<RedirectingOverlay visible={true} />);
    const overlay = screen.getByTestId("redirecting-overlay");
    expect(overlay).toBeTruthy();
    expect(overlay).toHaveAttribute("role", "status");
    expect(overlay).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("Redirecting...")).toBeTruthy();
  });

  it("accepts a custom label", () => {
    render(<RedirectingOverlay visible={true} label="Switching tenants..." />);
    expect(screen.getByText("Switching tenants...")).toBeTruthy();
  });

  it("is fixed-position and covers the viewport (basic style assertions)", () => {
    render(<RedirectingOverlay visible={true} />);
    const overlay = screen.getByTestId("redirecting-overlay");
    // Inline styles, not class-based - verify the load-bearing properties.
    expect(overlay.style.position).toBe("fixed");
    expect(overlay.style.inset).toBe("0px");
    // z-index is highest 32-bit signed int so nothing in the page can sit on top
    expect(overlay.style.zIndex).toBe("2147483647");
  });
});
