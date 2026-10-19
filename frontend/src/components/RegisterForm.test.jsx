import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";

// Mock api: get rejects so settings stays empty; post is unused
// (registration goes through the onRegister prop).
vi.mock("../api", () => ({
  api: {
    post: vi.fn(),
    get: vi.fn().mockRejectedValue(new Error("settings not fetched in test")),
  },
  API_BASE_URL: "http://localhost:4000",
}));

// Keep the org-id hook hermetic (no router/context dependency in the test).
vi.mock("../hooks/useOrganizationId", () => ({
  default: () => "demo-corp",
}));

import { api } from "../api";
import RegisterForm from "./RegisterForm";

const VALID = {
  email: "buyer@example.com",
  password: "Password123!",
};

async function fillRequiredFields(user) {
  await user.type(screen.getByTestId("email").querySelector("input"), VALID.email);
  await user.type(screen.getByTestId("password").querySelector("input"), VALID.password);
  await user.type(screen.getByTestId("confirmPassword").querySelector("input"), VALID.password);
}

describe("RegisterForm username removal (#892)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render a username field", () => {
    render(
      <MemoryRouter>
        <RegisterForm onRegister={vi.fn()} onSwitchMode={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.queryByTestId("username")).not.toBeInTheDocument();
  });

  it("always requires email, regardless of tenant settings", () => {
    render(
      <MemoryRouter>
        <RegisterForm onRegister={vi.fn()} onSwitchMode={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByTestId("email").querySelector("input")).toBeRequired();
  });
});

describe("RegisterForm referral code (Phase 3 Slice 1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders an optional referral field and submits without it", async () => {
    const user = userEvent.setup();
    const onRegister = vi.fn().mockResolvedValue({});

    render(
      <MemoryRouter>
        <RegisterForm onRegister={onRegister} onSwitchMode={vi.fn()} />
      </MemoryRouter>
    );

    const referralInput = screen.getByTestId("referralCode").querySelector("input");
    expect(referralInput).toBeInTheDocument();
    // Optional: the field carries no `required` attribute.
    expect(referralInput).not.toBeRequired();

    await fillRequiredFields(user);
    await user.click(screen.getByTestId("submit-button"));

    await waitFor(() => expect(onRegister).toHaveBeenCalledTimes(1));
    // Signature (#892): (email, password, organizationId, referralCode)
    const args = onRegister.mock.calls[0];
    expect(args[0]).toBe(VALID.email);
    expect(args[1]).toBe(VALID.password);
    expect(args[2]).toBe("demo-corp");
    expect(args[3]).toBe(""); // blank referral passed through, not required
  });

  it("passes a typed referral code through to onRegister", async () => {
    const user = userEvent.setup();
    const onRegister = vi.fn().mockResolvedValue({});

    render(
      <MemoryRouter>
        <RegisterForm onRegister={onRegister} onSwitchMode={vi.fn()} />
      </MemoryRouter>
    );

    await fillRequiredFields(user);
    await user.type(screen.getByTestId("referralCode").querySelector("input"), "consultant-xyz");
    await user.click(screen.getByTestId("submit-button"));

    await waitFor(() => expect(onRegister).toHaveBeenCalledTimes(1));
    expect(onRegister.mock.calls[0][3]).toBe("consultant-xyz");
  });
});

describe("RegisterForm org-less self-serve mode (Phase 5 5d, #869)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render the org-less hint and still requires email by default", () => {
    render(
      <MemoryRouter>
        <RegisterForm onRegister={vi.fn()} onSwitchMode={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.queryByTestId("orgless-register-hint")).not.toBeInTheDocument();
    // #892: email is always required, org-scoped or not.
    expect(screen.getByTestId("email").querySelector("input")).toBeRequired();
  });

  it("renders the org-less hint, requires email, and skips the settings fetch", () => {
    render(
      <MemoryRouter>
        <RegisterForm onRegister={vi.fn()} onSwitchMode={vi.fn()} orgLess />
      </MemoryRouter>
    );
    expect(screen.getByTestId("orgless-register-hint")).toBeInTheDocument();
    expect(screen.getByTestId("email").querySelector("input")).toBeRequired();
    // No tenant yet: the per-tenant public settings call must not fire.
    expect(api.get).not.toHaveBeenCalled();
  });
});
