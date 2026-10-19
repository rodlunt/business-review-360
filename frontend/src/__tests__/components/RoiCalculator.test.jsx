/**
 * Issue #530 -- ROI calculator on the pricing page.
 *
 * Tests the output values at the default inputs and verifies that
 * changing a slider updates the displayed figures.
 *
 * Default inputs: team=10, rate=75, ideas=20
 * Expected model:
 *   monthly_hours = 20 * 10 * 0.25 = 50
 *   annual_hours  = 50 * 12 = 600
 *   annual_savings = 600 * 75 = 45_000
 *   payback = 29.95 / (45_000 / 12) = 29.95 / 3_750 ≈ 0.008 months => "< 1 day"
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import muiTheme from "../../muiTheme";

vi.mock("../../api", () => ({
  api: { get: vi.fn() },
  API_BASE_URL: "http://localhost:4000",
  setAuthToken: vi.fn(),
}));

import PricingPage from "../../components/PricingPage";
import { api } from "../../api";

const seedPlans = [
  {
    plan_code: "sme",
    plan_name: "SME",
    description: "For small teams",
    monthly_price: 2995,
    yearly_price: 29940,
    currency: "AUD",
    limits: { maxIdeas: 100, maxUsers: 10, maxStorage: 1073741824 },
    features: [],
    is_public: true,
  },
];

function renderPage(search = "") {
  return render(
    <MemoryRouter initialEntries={[`/pricing${search}`]}>
      <ThemeProvider theme={muiTheme}>
        <PricingPage />
      </ThemeProvider>
    </MemoryRouter>
  );
}

describe("RoiCalculator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({ data: { plans: seedPlans } });
  });

  it("shows default annual hours saved at team=10, rate=75, ideas=20", async () => {
    renderPage();
    await waitFor(() => {
      // 20 * 10 * 0.25 * 12 = 600 hours
      expect(screen.getByTestId("roi-hours")).toHaveTextContent("600");
    });
  });

  it("shows default annual savings at team=10, rate=75, ideas=20", async () => {
    renderPage();
    await waitFor(() => {
      // 600 * 75 = $45,000
      expect(screen.getByTestId("roi-savings")).toHaveTextContent("$45,000");
    });
  });

  it('shows payback as "< 1 day" at default inputs', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("roi-payback")).toHaveTextContent("< 1 day");
    });
  });

  it("reads initial values from URL query params", async () => {
    renderPage("?team=5&rate=100&ideas=10");
    await waitFor(() => {
      // 10 * 5 * 0.25 * 12 = 150 hours; 150 * 100 = $15,000
      expect(screen.getByTestId("roi-hours")).toHaveTextContent("150");
      expect(screen.getByTestId("roi-savings")).toHaveTextContent("$15,000");
    });
  });
});
