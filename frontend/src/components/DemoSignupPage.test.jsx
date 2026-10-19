import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";

const setUser = vi.fn();
const navigateMock = vi.fn();

vi.mock("../api", () => ({
  api: { post: vi.fn() },
  setAuthToken: vi.fn(),
  API_BASE_URL: "http://localhost:4000",
}));

vi.mock("react-google-recaptcha-v3", () => ({
  useGoogleReCaptcha: () => ({ executeRecaptcha: undefined }),
}));

vi.mock("../auth", () => ({
  useAuth: () => ({ setUser }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

import DemoSignupPage from "./DemoSignupPage";
import { api, setAuthToken } from "../api";

describe("DemoSignupPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the four required fields and the submit button", () => {
    render(
      <MemoryRouter>
        <DemoSignupPage />
      </MemoryRouter>
    );

    expect(screen.getByTestId("fullName").querySelector("input")).toBeInTheDocument();
    expect(screen.getByTestId("companyName").querySelector("input")).toBeInTheDocument();
    expect(screen.getByTestId("email").querySelector("input")).toBeInTheDocument();
    expect(screen.getByTestId("password").querySelector("input")).toBeInTheDocument();
    expect(screen.getByTestId("submit")).toBeInTheDocument();
  });

  it("submits the form, sets auth state, and redirects to demo-corp home on success", async () => {
    const user = userEvent.setup();
    api.post.mockResolvedValueOnce({
      data: {
        token: "demo-token",
        user: {
          id: "u-1",
          username: "sarah-acme",
          isAdmin: false,
          isApproved: true,
          organizationId: "demo-corp",
        },
      },
    });

    render(
      <MemoryRouter>
        <DemoSignupPage />
      </MemoryRouter>
    );

    await user.type(screen.getByTestId("fullName").querySelector("input"), "Sarah Chen");
    await user.type(screen.getByTestId("companyName").querySelector("input"), "Acme Co");
    await user.type(screen.getByTestId("email").querySelector("input"), "sarah@acme.example");
    await user.type(screen.getByTestId("password").querySelector("input"), "longerthan8chars");
    await user.click(screen.getByTestId("submit"));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/auth/demo-signup",
        expect.objectContaining({
          email: "sarah@acme.example",
          fullName: "Sarah Chen",
          companyName: "Acme Co",
          password: "longerthan8chars",
        })
      );
    });

    expect(setAuthToken).toHaveBeenCalledWith("demo-token");
    expect(setUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: "u-1", organizationId: "demo-corp" })
    );
    expect(navigateMock).toHaveBeenCalledWith("/org/demo-corp/home", { replace: true });
  });

  it("surfaces a server error inline and does not redirect", async () => {
    const user = userEvent.setup();
    api.post.mockRejectedValueOnce({ response: { data: { error: "Email already in use" } } });

    render(
      <MemoryRouter>
        <DemoSignupPage />
      </MemoryRouter>
    );

    await user.type(screen.getByTestId("fullName").querySelector("input"), "Dup");
    await user.type(screen.getByTestId("companyName").querySelector("input"), "X");
    await user.type(screen.getByTestId("email").querySelector("input"), "dup@x.example");
    await user.type(screen.getByTestId("password").querySelector("input"), "longerthan8chars");
    await user.click(screen.getByTestId("submit"));

    await waitFor(() => {
      expect(screen.getByTestId("error-message")).toHaveTextContent(/email already in use/i);
    });

    expect(setAuthToken).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});

// #892 PR4: secondary magic-link request option on the same page.
describe("DemoSignupPage -- magic-link request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submits the email and shows the sent-confirmation state", async () => {
    const user = userEvent.setup();
    api.post.mockResolvedValueOnce({
      data: {
        success: true,
        message: "If that address can receive mail, a sign-in link is on its way.",
      },
    });

    render(
      <MemoryRouter>
        <DemoSignupPage />
      </MemoryRouter>
    );

    await user.type(
      screen.getByTestId("magic-link-email").querySelector("input"),
      "guest@example.com"
    );
    await user.click(screen.getByTestId("magic-link-submit"));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/auth/magic-link", { email: "guest@example.com" });
    });

    expect(await screen.findByTestId("magic-link-sent")).toBeInTheDocument();
    // No session is established by the request step -- only redeem does that.
    expect(setAuthToken).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("surfaces a network error inline without entering the sent state", async () => {
    const user = userEvent.setup();
    api.post.mockRejectedValueOnce({ response: { data: { error: "Too many attempts" } } });

    render(
      <MemoryRouter>
        <DemoSignupPage />
      </MemoryRouter>
    );

    await user.type(
      screen.getByTestId("magic-link-email").querySelector("input"),
      "guest@example.com"
    );
    await user.click(screen.getByTestId("magic-link-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("magic-link-error")).toHaveTextContent(/too many attempts/i);
    });
    expect(screen.queryByTestId("magic-link-sent")).not.toBeInTheDocument();
  });
});
