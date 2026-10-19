import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";

// Mock the api module before importing the component. The real module calls
// axios.create at import time and reads import.meta.env; mocking keeps the
// test hermetic and lets us control the recovery endpoint response.
vi.mock("../api", () => ({
  api: {
    post: vi.fn(),
    get: vi.fn().mockRejectedValue(new Error("settings not fetched in test")),
  },
  API_BASE_URL: "http://localhost:4000",
  setAuthToken: vi.fn(),
}));

// Mock the reCAPTCHA hook (#559). Outside a GoogleReCaptchaProvider the real
// hook returns a function that throws on invocation; we need a hermetic stub
// so the `executeRecaptcha && ...` guard in the component falls through.
vi.mock("react-google-recaptcha-v3", () => ({
  useGoogleReCaptcha: () => ({ executeRecaptcha: undefined }),
}));

import LoginForm from "./LoginForm";
import { api } from "../api";

describe("LoginForm password recovery dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens the dialog, accepts an email, and shows success after api.post resolves", async () => {
    const user = userEvent.setup();
    api.post.mockResolvedValueOnce({ status: 200, data: { ok: true } });

    render(
      <MemoryRouter>
        <LoginForm onLogin={vi.fn()} onSwitchMode={vi.fn()} />
      </MemoryRouter>
    );

    // Trigger the recovery dialog.
    await user.click(screen.getByTestId("forgot-password-link"));

    // Dialog renders with the email input. MUI attaches data-testid to the
    // input wrapper, so query the actual <input> inside it.
    const dialog = await screen.findByRole("dialog");
    const emailInput = within(dialog).getByTestId("reset-email").querySelector("input");
    expect(emailInput).toBeInTheDocument();

    // Email field accepts text.
    await user.type(emailInput, "rodney@example.com");
    expect(emailInput).toHaveValue("rodney@example.com");

    // Submit recovery request.
    await user.click(within(dialog).getByTestId("reset-button"));

    // Success alert appears once api.post resolves.
    await waitFor(() => {
      expect(screen.getByTestId("success-message")).toBeInTheDocument();
    });
    expect(screen.getByTestId("success-message")).toHaveTextContent(/recovery email sent/i);

    // Confirm the api was called with the correct endpoint and payload.
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith("/auth/request-password-reset", {
      email: "rodney@example.com",
    });
  });
});

// #892: the org-scoped credential field is now email, not username. The
// two modes converge on the same field (label, type, data-testid); only
// the org-less-specific hint copy and discovery CTAs still differ.
describe("LoginForm credential field (#892)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders an email field (not username) on the org-scoped form", () => {
    render(
      <MemoryRouter>
        <LoginForm onLogin={vi.fn()} onSwitchMode={vi.fn()} />
      </MemoryRouter>
    );

    expect(screen.queryByTestId("username")).not.toBeInTheDocument();
    const input = screen.getByTestId("email").querySelector("input");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("type", "email");
    expect(input).toHaveAttribute("name", "email");
  });

  it("renders the same email field on the org-less form", () => {
    render(
      <MemoryRouter>
        <LoginForm onLogin={vi.fn()} onSwitchMode={vi.fn()} orgLess />
      </MemoryRouter>
    );

    expect(screen.queryByTestId("username")).not.toBeInTheDocument();
    const input = screen.getByTestId("email").querySelector("input");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("type", "email");
  });

  it("submits the typed email (not a username) to onLogin on the org-scoped form", async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn().mockResolvedValue({ kind: "authed", user: {} });

    render(
      <MemoryRouter>
        <LoginForm onLogin={onLogin} onSwitchMode={vi.fn()} />
      </MemoryRouter>
    );

    await user.type(screen.getByTestId("email").querySelector("input"), "alice@example.com");
    await user.type(screen.getByTestId("password").querySelector("input"), "Password123!");
    await user.click(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledWith("alice@example.com", "Password123!", null);
    });
  });
});

// #892 PR2: persistent discovery CTAs on the org-less main-domain login.
// Anti-enumeration property: the same strip renders on the empty form AND
// on every login failure (wrong password, unknown email, no membership),
// so the CTAs themselves leak nothing about which emails exist.
describe("LoginForm discovery CTAs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the CTA strip on the org-less form (empty state)", () => {
    render(
      <MemoryRouter>
        <LoginForm onLogin={vi.fn()} onSwitchMode={vi.fn()} orgLess />
      </MemoryRouter>
    );

    const strip = screen.getByTestId("login-discovery-cta");
    expect(strip).toBeInTheDocument();
    expect(within(strip).getByTestId("cta-try-demo")).toHaveAttribute("href", "/demo-signup");
    expect(within(strip).getByTestId("cta-see-pricing")).toHaveAttribute("href", "/pricing");
    expect(within(strip).getByText(/need an invite/i)).toBeInTheDocument();
  });

  it("hides the CTA strip on the org-scoped (subdomain) form", () => {
    render(
      <MemoryRouter>
        <LoginForm onLogin={vi.fn()} onSwitchMode={vi.fn()} />
      </MemoryRouter>
    );

    expect(screen.queryByTestId("login-discovery-cta")).not.toBeInTheDocument();
  });

  it("renders OAuth buttons (Google / GitHub / Microsoft) on the org-less form", () => {
    render(
      <MemoryRouter>
        <LoginForm onLogin={vi.fn()} onSwitchMode={vi.fn()} orgLess />
      </MemoryRouter>
    );

    // #892 PR4: platform-level providers render unconditionally on org-less;
    // Azure SSO is per-tenant config and stays off here.
    expect(screen.getByTestId("oauth-google")).toBeInTheDocument();
    expect(screen.getByTestId("oauth-github")).toBeInTheDocument();
    expect(screen.getByTestId("oauth-microsoft")).toBeInTheDocument();
  });

  it("hides OAuth buttons on the org-scoped form when per-tenant settings have not loaded", () => {
    // Default api.get mock rejects (line 13), so the tenant settings fetch
    // fails and the per-tenant oauth*Enabled flags stay undefined.
    render(
      <MemoryRouter>
        <LoginForm onLogin={vi.fn()} onSwitchMode={vi.fn()} />
      </MemoryRouter>
    );

    expect(screen.queryByTestId("oauth-google")).not.toBeInTheDocument();
    expect(screen.queryByTestId("oauth-github")).not.toBeInTheDocument();
    expect(screen.queryByTestId("oauth-microsoft")).not.toBeInTheDocument();
  });

  it("keeps the CTA strip identical after a login failure (anti-enumeration)", async () => {
    const user = userEvent.setup();
    const onLogin = vi
      .fn()
      .mockRejectedValue({ response: { data: { error: "Invalid credentials" } } });

    render(
      <MemoryRouter>
        <LoginForm onLogin={onLogin} onSwitchMode={vi.fn()} orgLess />
      </MemoryRouter>
    );

    // Snapshot the strip before submit.
    const stripBefore = screen.getByTestId("login-discovery-cta");
    const buttonsBefore = within(stripBefore).getAllByRole("link").length;
    const helperBefore = within(stripBefore).getByText(/need an invite/i).textContent;

    // Submit with credentials that the parent will reject.
    await user.type(screen.getByTestId("email").querySelector("input"), "ghost@example.com");
    await user.type(screen.getByTestId("password").querySelector("input"), "wrong");
    await user.click(screen.getByTestId("submit-button"));

    // Error alert appears, but the CTA strip is unchanged: same buttons, same
    // links, same helper text. No new content keyed off the failure.
    await waitFor(() => {
      expect(screen.getByTestId("error-message")).toBeInTheDocument();
    });

    const stripAfter = screen.getByTestId("login-discovery-cta");
    expect(within(stripAfter).getAllByRole("link").length).toBe(buttonsBefore);
    expect(within(stripAfter).getByTestId("cta-try-demo")).toHaveAttribute("href", "/demo-signup");
    expect(within(stripAfter).getByTestId("cta-see-pricing")).toHaveAttribute("href", "/pricing");
    expect(within(stripAfter).getByText(/need an invite/i).textContent).toBe(helperBefore);
  });
});

// #892 PR4: OAuth no-org welcome banner driven by the callback's redirect
// query params (?msg=oauth-no-org&name=Sarah). Only renders on the org-less
// form. Same enumeration-safe posture as the CTA strip: identical content
// regardless of whether the email exists on the platform.
describe("LoginForm OAuth no-org welcome banner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a personalised welcome banner when ?msg=oauth-no-org&name= is set", () => {
    render(
      <MemoryRouter initialEntries={["/login?msg=oauth-no-org&name=Sarah"]}>
        <LoginForm onLogin={vi.fn()} onSwitchMode={vi.fn()} orgLess />
      </MemoryRouter>
    );

    const banner = screen.getByTestId("oauth-no-org-banner");
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/Hi Sarah/);
    expect(banner).toHaveTextContent(/No organisation is linked/);
  });

  it("renders the welcome banner without a name when ?name= is absent", () => {
    render(
      <MemoryRouter initialEntries={["/login?msg=oauth-no-org"]}>
        <LoginForm onLogin={vi.fn()} onSwitchMode={vi.fn()} orgLess />
      </MemoryRouter>
    );

    const banner = screen.getByTestId("oauth-no-org-banner");
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/No organisation is linked/);
    expect(banner).not.toHaveTextContent(/Hi /);
  });

  it("renders the multi-org stop-gap banner when ?msg=oauth-multi-org is set", () => {
    render(
      <MemoryRouter initialEntries={["/login?msg=oauth-multi-org"]}>
        <LoginForm onLogin={vi.fn()} onSwitchMode={vi.fn()} orgLess />
      </MemoryRouter>
    );

    const banner = screen.getByTestId("oauth-multi-org-banner");
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/multiple organisations/);
  });

  it("does not render any banner without the query param", () => {
    render(
      <MemoryRouter>
        <LoginForm onLogin={vi.fn()} onSwitchMode={vi.fn()} orgLess />
      </MemoryRouter>
    );

    expect(screen.queryByTestId("oauth-no-org-banner")).not.toBeInTheDocument();
    expect(screen.queryByTestId("oauth-multi-org-banner")).not.toBeInTheDocument();
  });

  it("does not render the banner on the org-scoped form even if the query param is present", () => {
    render(
      <MemoryRouter initialEntries={["/login?msg=oauth-no-org&name=Sarah"]}>
        <LoginForm onLogin={vi.fn()} onSwitchMode={vi.fn()} />
      </MemoryRouter>
    );

    expect(screen.queryByTestId("oauth-no-org-banner")).not.toBeInTheDocument();
  });
});
