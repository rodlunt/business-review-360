import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import userEvent from "@testing-library/user-event";

const setUser = vi.fn();
const navigateMock = vi.fn();

vi.mock("../api", () => ({
  api: { post: vi.fn() },
  setAuthToken: vi.fn(),
  API_BASE_URL: "http://localhost:4000",
}));

vi.mock("../auth", () => ({
  useAuth: () => ({ setUser }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

import MagicLinkRedeemPage from "./MagicLinkRedeemPage";
import { api, setAuthToken } from "../api";

function renderAtToken(token) {
  const initialEntry = token
    ? `/auth/magic-link?token=${encodeURIComponent(token)}`
    : "/auth/magic-link";
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/auth/magic-link" element={<MagicLinkRedeemPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("MagicLinkRedeemPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not call redeem on mount -- consumption requires the explicit click", () => {
    renderAtToken("good-token");
    expect(api.post).not.toHaveBeenCalled();
    expect(screen.getByTestId("continue-as-guest")).toBeInTheDocument();
  });

  it("shows a missing-token message and no continue button when ?token= is absent", () => {
    renderAtToken(null);
    expect(screen.getByTestId("missing-token-message")).toBeInTheDocument();
    expect(screen.queryByTestId("continue-as-guest")).not.toBeInTheDocument();
  });

  it("consumes the token on click, sets auth state, and redirects to demo-corp home", async () => {
    const user = userEvent.setup();
    api.post.mockResolvedValueOnce({
      data: {
        token: "guest-jwt",
        user: {
          id: "u-guest-1",
          username: "guest_visitor",
          isAdmin: false,
          isApproved: true,
          organizationId: "demo-corp",
        },
      },
    });

    renderAtToken("good-token");
    await user.click(screen.getByTestId("continue-as-guest"));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/auth/magic-link/redeem", { token: "good-token" });
    });

    // setUser must be called BEFORE navigate (side-channel session
    // establishment convention -- CLAUDE.md, DemoAccessPage post-#878 fix).
    const setUserOrder = setUser.mock.invocationCallOrder[0];
    const navigateOrder = navigateMock.mock.invocationCallOrder[0];
    expect(setUserOrder).toBeLessThan(navigateOrder);

    expect(setAuthToken).toHaveBeenCalledWith("guest-jwt");
    expect(setUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: "u-guest-1", organizationId: "demo-corp" })
    );
    expect(navigateMock).toHaveBeenCalledWith("/org/demo-corp/home", { replace: true });
  });

  it("shows an inline error on an invalid or expired token and does not navigate", async () => {
    const user = userEvent.setup();
    api.post.mockRejectedValueOnce({ response: { data: { error: "Invalid or expired link" } } });

    renderAtToken("stale-token");
    await user.click(screen.getByTestId("continue-as-guest"));

    await waitFor(() => {
      expect(screen.getByTestId("error-message")).toHaveTextContent(/invalid or expired link/i);
    });
    expect(setAuthToken).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
