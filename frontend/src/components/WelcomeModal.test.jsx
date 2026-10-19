import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import WelcomeModal from "./WelcomeModal";

describe("WelcomeModal (Phase 3 Slice 5)", () => {
  it("shows the generic welcome when no org name is given", () => {
    render(<WelcomeModal onContinue={vi.fn()} />);
    expect(screen.getByText("Welcome to Business Review 360")).toBeInTheDocument();
  });

  it("personalises the heading with the org name", () => {
    render(<WelcomeModal orgName="Acme Pty Ltd" onContinue={vi.fn()} />);
    expect(screen.getByText("Welcome to Acme Pty Ltd")).toBeInTheDocument();
  });

  it("Continue is the only action and fires the callback", async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();
    render(<WelcomeModal onContinue={onContinue} />);

    // No dismiss-forever / cancel: Continue is the single button.
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);

    await user.click(screen.getByTestId("welcome-continue"));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
