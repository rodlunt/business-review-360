/**
 * Issue #605 -- /signup combobox accessible name + plan-list drift
 *
 * The dropdown at /signup currently hardcodes three legacy plans (starter,
 * professional, enterprise) and ships a <Select> whose label has no `id`, so
 * the rendered combobox has no computed accessible name. After Phases 2-3 of
 * the plan, all four cases here go green:
 *
 *   case 1 -- a11y wiring (Phase 2)
 *   case 2 -- options come from /billing/plans (Phase 3)
 *   case 3 -- API failure surfaces an inline Alert + disables Select (Phase 3)
 *   case 4 -- ?plan= URL hint default-selects the matching plan (Phase 3)
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

vi.mock("../api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
  API_BASE_URL: "http://localhost:4000",
  setAuthToken: vi.fn(),
}));

import CheckoutForm from "./CheckoutForm";
import { api } from "../api";

const seedPlans = [
  {
    plan_code: "sme",
    plan_name: "SME",
    description: "Small to mid-size business",
    monthly_price: 2995,
    yearly_price: 29940,
    currency: "AUD",
    limits: { maxIdeas: 100, maxUsers: 10, maxStorage: 1073741824 },
    features: [],
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
    features: [],
    is_public: true,
  },
  {
    plan_code: "enterprise",
    plan_name: "Enterprise",
    description: "Large organisations",
    monthly_price: 24900,
    yearly_price: 249000,
    currency: "AUD",
    limits: { maxIdeas: -1, maxUsers: -1, maxStorage: -1 },
    features: [],
    is_public: true,
  },
];

function renderAt(initialEntries = ["/signup"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <CheckoutForm />
    </MemoryRouter>
  );
}

describe("CheckoutForm /signup plan picker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes a "Plan" accessible name on the combobox (a11y)', async () => {
    api.get.mockResolvedValueOnce({ data: { plans: seedPlans } });

    renderAt();

    // findByRole waits for the Phase 3 fetch to settle. The query itself is the
    // assertion: it walks the aria-labelledby chain and matches against "Plan".
    // Pre-Phase-2, MUI's Select aria-labelledby points at an id that does not
    // exist on the InputLabel, so this throws.
    const combobox = await screen.findByRole("combobox", { name: "Plan" });
    expect(combobox).toBeInTheDocument();
  });

  it("renders one option per plan returned by /billing/plans, with the spec format", async () => {
    api.get.mockResolvedValueOnce({ data: { plans: seedPlans } });
    const user = userEvent.setup();

    renderAt();

    // Wait for the combobox to settle so the underlying options are mounted.
    const combobox = await screen.findByRole("combobox", { name: "Plan" });

    // Open the listbox via userEvent. MUI Select listens on mousedown via React
    // synthetic events; raw DOM .click() does not open the listbox in jsdom.
    await user.click(combobox);

    const options = await screen.findAllByRole("option");
    const labels = options.map((o) => o.textContent);

    expect(labels).toEqual([
      "SME - $29.95/month inc GST",
      "Professional - $49.95/month inc GST",
      "Enterprise - $249.00/month inc GST",
    ]);
    expect(api.get).toHaveBeenCalledWith("/billing/plans");
  });

  it("shows an inline Alert and disables the Select when the API rejects", async () => {
    api.get.mockRejectedValueOnce(new Error("network down"));

    renderAt();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/could not load pricing plans/i);

    // Retry button is part of the Alert's action region.
    expect(within(alert).getByRole("button", { name: /retry/i })).toBeInTheDocument();

    // FormControl disabled propagates aria-disabled to the combobox role.
    await waitFor(() => {
      const combobox = screen.getByRole("combobox", { name: "Plan" });
      expect(combobox).toHaveAttribute("aria-disabled", "true");
    });
  });

  it("default-selects the plan named in ?plan= when present", async () => {
    api.get.mockResolvedValueOnce({ data: { plans: seedPlans } });

    renderAt(["/signup?plan=pro"]);

    // The combobox shows the selected option's display text. Per spec section
    // 5 the format is "${plan_name} - $${monthly_price/100}/month inc GST".
    const combobox = await screen.findByRole("combobox", { name: "Plan" });
    await waitFor(() => {
      expect(combobox).toHaveTextContent("Professional - $49.95/month inc GST");
    });
  });

  it("seeds billingInterval from ?interval=yearly URL param and posts billingInterval=yearly", async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValueOnce({ data: { plans: seedPlans } });
    api.post.mockResolvedValueOnce({ data: { sessionUrl: "https://stripe.example/sess" } });

    renderAt(["/signup?plan=pro&interval=yearly"]);

    await waitFor(() => {
      expect(screen.getByLabelText(/organisation name/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/organisation name/i), "Acme");
    await user.type(screen.getByLabelText(/organisation id/i), "acme");
    await user.type(screen.getByLabelText(/email/i), "admin@acme.test");
    await user.type(screen.getByLabelText(/first name/i), "Ada");
    await user.type(screen.getByLabelText(/last name/i), "Lovelace");
    await user.click(screen.getByRole("button", { name: /continue to payment/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/billing/checkout",
        expect.objectContaining({ billingInterval: "yearly" })
      );
    });
  });

  it("defaults billingInterval to monthly when no ?interval= URL param is present", async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValueOnce({ data: { plans: seedPlans } });
    api.post.mockResolvedValueOnce({ data: { sessionUrl: "https://stripe.example/sess" } });

    renderAt(["/signup?plan=pro"]);

    await waitFor(() => {
      expect(screen.getByLabelText(/organisation name/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/organisation name/i), "Acme");
    await user.type(screen.getByLabelText(/organisation id/i), "acme");
    await user.type(screen.getByLabelText(/email/i), "admin@acme.test");
    await user.type(screen.getByLabelText(/first name/i), "Ada");
    await user.type(screen.getByLabelText(/last name/i), "Lovelace");
    await user.click(screen.getByRole("button", { name: /continue to payment/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/billing/checkout",
        expect.objectContaining({ billingInterval: "monthly" })
      );
    });
  });
});
