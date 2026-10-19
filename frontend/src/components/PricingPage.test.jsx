/**
 * Issue #641 -- PricingPage MUI rewrite (folds #614)
 *
 * The current PricingPage POSTs to /billing/checkout for paid plans, which is
 * broken (#614). After this rewrite, paid plans redirect to /signup with the
 * billing interval preserved as a URL param.
 *
 * Cases:
 *   1. renders plan cards with names + prices
 *   2. monthly/yearly toggle updates displayed price
 *   3. free plan click redirects to /signup?plan=free
 *   4. pro plan click on monthly redirects to /signup?plan=pro&interval=monthly
 *   5. pro plan click on yearly redirects to /signup?plan=pro&interval=yearly
 *   6. custom plan click opens the contact sales modal
 *   7. /billing/plans fetch failure shows an Alert with retry button
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import muiTheme from "../muiTheme";

vi.mock("../api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
  API_BASE_URL: "http://localhost:4000",
  setAuthToken: vi.fn(),
}));

import PricingPage from "./PricingPage";
import { api } from "../api";

const seedPlans = [
  {
    plan_code: "free",
    plan_name: "Free",
    description: "Get started at no cost",
    monthly_price: 0,
    yearly_price: 0,
    currency: "AUD",
    limits: { maxIdeas: 10, maxUsers: 3, maxStorage: 1073741824 },
    features: ["core_features", "community_support"],
    is_public: true,
  },
  {
    plan_code: "pro",
    plan_name: "Professional",
    description: "Growing teams",
    monthly_price: 4995,
    yearly_price: 49940,
    currency: "AUD",
    limits: { maxIdeas: 500, maxUsers: 50, maxStorage: 5368709120 },
    features: ["core_features", "advanced_analytics", "priority_support"],
    is_public: true,
  },
  {
    plan_code: "custom",
    plan_name: "Custom",
    description: "Tailored to you",
    monthly_price: 0,
    yearly_price: 0,
    currency: "AUD",
    limits: { maxIdeas: -1, maxUsers: -1, maxStorage: -1 },
    features: ["core_features", "dedicated_support", "sla"],
    is_public: true,
  },
];

let originalLocation;

function renderPage() {
  return render(
    <MemoryRouter>
      <ThemeProvider theme={muiTheme}>
        <PricingPage />
      </ThemeProvider>
    </MemoryRouter>
  );
}

describe("PricingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    originalLocation = window.location;
    Object.defineProperty(window, "location", {
      writable: true,
      value: { href: "" },
    });
  });

  afterEach(() => {
    window.location = originalLocation;
  });

  it("renders a card for each plan with name, description, and price", async () => {
    api.get.mockResolvedValueOnce({ data: { plans: seedPlans } });
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Professional" })).toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { level: 2, name: "Free" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: "Free" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Custom" })).toBeInTheDocument();
    expect(screen.getByText("Growing teams")).toBeInTheDocument();
    expect(screen.getByText(/\$49\.95/)).toBeInTheDocument();
  });

  it("switches displayed prices when the Annually toggle is clicked", async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValueOnce({ data: { plans: seedPlans } });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/\$49\.95/)).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /annually/i }));
    await waitFor(() => {
      expect(screen.getByText(/\$499\.40/)).toBeInTheDocument();
    });
  });

  it("redirects free plan click to /demo-signup (#892 PR3 follow-up, was #531)", async () => {
    // #892 PR3 follow-up: free-tier CTA now lands prospects in the
    // per-prospect /demo-signup flow rather than the legacy register form
    // on demo-corp's subdomain. Original #531 contract (does redirect
    // somewhere on free-plan click) preserved; only the destination changed.
    const user = userEvent.setup();
    api.get.mockResolvedValueOnce({ data: { plans: seedPlans } });
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Free" })).toBeInTheDocument();
    });
    const freeCard = screen
      .getByRole("heading", { level: 2, name: "Free" })
      .closest(".MuiCard-root");
    const freeButton = freeCard.querySelector("button");
    await user.click(freeButton);
    expect(window.location.href).toBe("/demo-signup");
  });

  it("redirects pro plan click on monthly to /signup?plan=pro&interval=monthly", async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValueOnce({ data: { plans: seedPlans } });
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Professional" })).toBeInTheDocument();
    });
    const proCard = screen
      .getByRole("heading", { level: 2, name: "Professional" })
      .closest(".MuiCard-root");
    const proButton = proCard.querySelector("button");
    await user.click(proButton);
    expect(window.location.href).toBe("/signup?plan=pro&interval=monthly");
  });

  it("redirects pro plan click on yearly to /signup?plan=pro&interval=yearly", async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValueOnce({ data: { plans: seedPlans } });
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Professional" })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /annually/i }));
    const proCard = screen
      .getByRole("heading", { level: 2, name: "Professional" })
      .closest(".MuiCard-root");
    const proButton = proCard.querySelector("button");
    await user.click(proButton);
    expect(window.location.href).toBe("/signup?plan=pro&interval=yearly");
  });

  it("opens the contact sales modal when the custom plan button is clicked", async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValueOnce({ data: { plans: seedPlans } });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Custom")).toBeInTheDocument();
    });
    const customCard = screen.getByText("Custom").closest(".MuiCard-root");
    const customButton = customCard.querySelector("button");
    await user.click(customButton);
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  it("shows an error alert with retry when the plans fetch fails", async () => {
    const user = userEvent.setup();
    api.get.mockRejectedValueOnce(new Error("Network down"));
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    api.get.mockResolvedValueOnce({ data: { plans: seedPlans } });
    await user.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Professional" })).toBeInTheDocument();
    });
  });
});
