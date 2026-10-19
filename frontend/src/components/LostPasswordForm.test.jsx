import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Hermetic api + reCAPTCHA stubs (mirrors LoginForm.test.jsx). get rejects so
// settings stays default; post is unused by these copy-variant tests.
vi.mock("../api", () => ({
  api: {
    post: vi.fn(),
    get: vi.fn().mockRejectedValue(new Error("settings not fetched in test")),
  },
  API_BASE_URL: "http://localhost:4000",
}));
vi.mock("react-google-recaptcha-v3", () => ({
  useGoogleReCaptcha: () => ({ executeRecaptcha: undefined }),
}));
vi.mock("./Footer", () => ({ default: () => null }));

import LostPasswordForm from "./LostPasswordForm";

let originalLocation;

function setSearch(search) {
  Object.defineProperty(window, "location", {
    writable: true,
    value: { search, pathname: "/reset-password", href: "" },
  });
}

describe("LostPasswordForm activation vs reset copy (Phase 3 Slice 3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    originalLocation = window.location;
  });
  afterEach(() => {
    window.location = originalLocation;
  });

  it("shows reset copy and prefills the token when there is no activation marker", () => {
    setSearch("?token=reset-abc");
    render(<LostPasswordForm onSuccess={vi.fn()} />);

    expect(screen.getByRole("heading")).toHaveTextContent("Reset Your Password");
    expect(screen.getByTestId("reset-password-submit")).toHaveTextContent("Reset Password");
    expect(screen.getByTestId("reset-token").querySelector("input")).toHaveValue("reset-abc");
  });

  it("shows activation copy when the link carries activation=1", () => {
    setSearch("?token=invite-xyz&activation=1");
    render(<LostPasswordForm onSuccess={vi.fn()} />);

    expect(screen.getByRole("heading")).toHaveTextContent("Activate Your Account");
    expect(screen.getByTestId("reset-password-submit")).toHaveTextContent("Activate Account");
    // Token field relabelled but mechanically identical (still prefilled).
    expect(screen.getByTestId("reset-token").querySelector("input")).toHaveValue("invite-xyz");
  });

  it('treats any non-"1" activation value as a normal reset', () => {
    setSearch("?token=t&activation=true");
    render(<LostPasswordForm onSuccess={vi.fn()} />);
    expect(screen.getByRole("heading")).toHaveTextContent("Reset Your Password");
  });
});
