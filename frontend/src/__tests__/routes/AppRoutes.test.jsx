import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// The route table mounts page components. We mock each leaf component with a
// recognisable stub so we can assert which one rendered for a given path.
// This is the regression test for #630: the legacy pathname.includes()
// matching mounted three components at once for /admin/email-analytics.

vi.mock("../../components/ErrorPage", () => ({
  default: ({ code }) => (
    <div data-testid="page-error" data-code={code}>
      ErrorPage
    </div>
  ),
}));

vi.mock("../../components/OrganizationPrompt", () => ({
  default: () => <div data-testid="page-organization-prompt">OrganizationPrompt</div>,
}));
vi.mock("../../components/OrganizationLanding", () => ({
  default: () => <div data-testid="page-organization-landing">OrganizationLanding</div>,
}));
vi.mock("../../components/ReviewIdeas", () => ({
  default: () => <div data-testid="page-review-ideas">ReviewIdeas</div>,
}));
vi.mock("../../components/SubmitIdea", () => ({
  default: () => <div data-testid="page-submit-idea">SubmitIdea</div>,
}));
vi.mock("../../components/AdminSettings", () => ({
  default: () => <div data-testid="page-admin-settings">AdminSettings</div>,
}));
vi.mock("../../components/Analytics", () => ({
  default: () => <div data-testid="page-analytics">Analytics</div>,
}));
vi.mock("../../components/EmailAnalyticsDashboard", () => ({
  default: () => <div data-testid="page-email-analytics">EmailAnalyticsDashboard</div>,
}));
vi.mock("../../components/NotificationSettings", () => ({
  default: () => <div data-testid="page-notification-settings">NotificationSettings</div>,
}));
vi.mock("../../components/PricingPage", () => ({
  default: () => <div data-testid="page-pricing">PricingPage</div>,
}));
vi.mock("../../components/CheckoutForm", () => ({
  default: () => <div data-testid="page-checkout">CheckoutForm</div>,
}));
vi.mock("../../components/BillingSuccess.jsx", () => ({
  default: () => <div data-testid="page-billing-success">BillingSuccess</div>,
}));
vi.mock("../../components/BillingCancel.jsx", () => ({
  default: () => <div data-testid="page-billing-cancel">BillingCancel</div>,
}));
vi.mock("../../components/SuperuserSetupPage", () => ({
  default: () => <div data-testid="page-superuser-setup">SuperuserSetupPage</div>,
}));
vi.mock("../../components/UnsubscribePage", () => ({
  default: () => <div data-testid="page-unsubscribe">UnsubscribePage</div>,
}));

// Stub App as a minimal outlet provider so AppRoutes can render without pulling
// in the full App dependency tree (Shepherd, MUI, emotion) which OOMs the worker.
// Route tests only care about which page component renders for a given URL; they
// don't need App's auth, theme, or tour logic.
vi.mock("../../App", async () => {
  const { Outlet } = await import("react-router-dom");
  return {
    default: function AppStub() {
      return (
        <Outlet
          context={{
            user: { username: "tester", isAdmin: true, organizationId: "acme" },
            organizationId: "acme",
            onSettingsUpdate: () => {},
            onNavigateRelative: () => {},
          }}
        />
      );
    },
  };
});

// Suppress useAuth and api side effects from App's real implementation by
// mocking the modules App imports.
vi.mock("../../auth", () => ({
  useAuth: () => ({
    user: { username: "tester", isAdmin: true, organizationId: "acme" },
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    loading: false,
  }),
}));
vi.mock("../../api", () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: { superuserRequired: false } }),
    post: vi.fn(),
  },
  API_BASE_URL: "http://localhost:4000",
  setAuthToken: vi.fn(),
}));
vi.mock("../../hooks/useBrowserBackNavigation", () => ({
  default: () => {},
}));
vi.mock("../../hooks/useResponsive", () => ({
  useResponsive: () => ({ isMobile: false, isSmallScreen: false }),
}));
vi.mock("../../components/Layout", () => ({
  default: ({ children }) => <div data-testid="layout">{children}</div>,
}));
vi.mock("../../components/AuthForm", () => ({
  default: () => <div data-testid="page-auth-form">AuthForm</div>,
}));
vi.mock("../../components/LostPasswordForm", () => ({
  default: () => <div data-testid="page-lost-password-form">LostPasswordForm</div>,
}));
vi.mock("../../components/SuperuserSetup", () => ({
  default: () => <div data-testid="page-superuser-setup-prompt">SuperuserSetup</div>,
}));
vi.mock("../../components/AdminUserManager", () => ({
  default: () => <div data-testid="page-admin-user-manager">AdminUserManager</div>,
}));
vi.mock("../../components/IdeaView", () => ({
  default: () => <div data-testid="page-idea-view">IdeaView</div>,
}));
vi.mock("../../components/Header", () => ({
  default: () => null,
}));
vi.mock("../../components/Footer", () => ({
  default: () => null,
}));

// index.jsx calls createRoot at module load, which dies under jsdom without a
// mounted #root element. Stub it to prevent that side-effect.
vi.mock("../../index", () => ({}));

// Contexts live in their own module now; mock them separately so components
// that import from contexts.js get the test doubles, not the real defaults.
vi.mock("../../contexts", async () => {
  const React = await import("react");
  return {
    ThemeContext: React.createContext({}),
    SettingsContext: React.createContext({
      primaryColor: null,
      setPrimaryColor: () => {},
      logoUrl: null,
      setLogoUrl: () => {},
      logoHighContrast: false,
      setLogoHighContrast: () => {},
    }),
  };
});

import { AppRoutes } from "../../AppRoutes";

const renderAtPath = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>
  );

describe("AppRoutes route table", () => {
  beforeEach(() => {
    cleanup();
  });

  it("renders only EmailAnalyticsDashboard for /org/:id/admin/email-analytics", async () => {
    renderAtPath("/org/acme/admin/email-analytics");
    expect(await screen.findByTestId("page-email-analytics")).toBeInTheDocument();
    // Critical regression: AdminSettings and Analytics must NOT mount.
    expect(screen.queryByTestId("page-admin-settings")).not.toBeInTheDocument();
    expect(screen.queryByTestId("page-analytics")).not.toBeInTheDocument();
  });

  it("renders only AdminSettings for /org/:id/admin", async () => {
    renderAtPath("/org/acme/admin");
    expect(await screen.findByTestId("page-admin-settings")).toBeInTheDocument();
    expect(screen.queryByTestId("page-email-analytics")).not.toBeInTheDocument();
    expect(screen.queryByTestId("page-analytics")).not.toBeInTheDocument();
  });

  it("renders only Analytics for /org/:id/analytics", async () => {
    renderAtPath("/org/acme/analytics");
    expect(await screen.findByTestId("page-analytics")).toBeInTheDocument();
    expect(screen.queryByTestId("page-admin-settings")).not.toBeInTheDocument();
    expect(screen.queryByTestId("page-email-analytics")).not.toBeInTheDocument();
  });

  it("renders only Analytics for /org/:id/analytics/priority-matrix", async () => {
    renderAtPath("/org/acme/analytics/priority-matrix");
    expect(await screen.findByTestId("page-analytics")).toBeInTheDocument();
    expect(screen.queryByTestId("page-admin-settings")).not.toBeInTheDocument();
  });

  it("renders only Analytics for /org/:id/analytics/word-cloud", async () => {
    renderAtPath("/org/acme/analytics/word-cloud");
    expect(await screen.findByTestId("page-analytics")).toBeInTheDocument();
    expect(screen.queryByTestId("page-admin-settings")).not.toBeInTheDocument();
  });

  it("renders only ReviewIdeas for /org/:id/review", async () => {
    renderAtPath("/org/acme/review");
    expect(await screen.findByTestId("page-review-ideas")).toBeInTheDocument();
    expect(screen.queryByTestId("page-admin-settings")).not.toBeInTheDocument();
    expect(screen.queryByTestId("page-submit-idea")).not.toBeInTheDocument();
  });

  it("renders only ReviewIdeas for /org/:id/home", async () => {
    renderAtPath("/org/acme/home");
    expect(await screen.findByTestId("page-review-ideas")).toBeInTheDocument();
    expect(screen.queryByTestId("page-submit-idea")).not.toBeInTheDocument();
  });

  it("renders only SubmitIdea for /org/:id/submit", async () => {
    renderAtPath("/org/acme/submit");
    expect(await screen.findByTestId("page-submit-idea")).toBeInTheDocument();
    expect(screen.queryByTestId("page-review-ideas")).not.toBeInTheDocument();
  });

  it("renders only NotificationSettings for /org/:id/notifications", async () => {
    renderAtPath("/org/acme/notifications");
    expect(await screen.findByTestId("page-notification-settings")).toBeInTheDocument();
    expect(screen.queryByTestId("page-admin-settings")).not.toBeInTheDocument();
  });

  it("renders OrganizationLanding for the org landing path", async () => {
    renderAtPath("/org/acme");
    expect(await screen.findByTestId("page-organization-landing")).toBeInTheDocument();
  });

  it("renders OrganizationPrompt for /org", async () => {
    renderAtPath("/org");
    expect(await screen.findByTestId("page-organization-prompt")).toBeInTheDocument();
  });

  // Phase 5 5b (#866 / Correction Decision A): bare-domain auth routes must
  // render App directly, NOT force-redirect to /org (OrganizationPrompt).
  // In JSDOM getSubdomainOrgId() is null (hostname "localhost"), which is
  // exactly the main-domain case the old SubdomainAppWrapper redirected.
  it.each(["/login", "/register", "/reset-password"])(
    "does not force %s to the /org OrganizationPrompt gate",
    async (path) => {
      renderAtPath(path);
      // App stub mounts (its Outlet renders the AuthOutletPlaceholder = null);
      // the key regression is that OrganizationPrompt is NOT shown.
      await waitFor(() =>
        expect(screen.queryByTestId("page-organization-prompt")).not.toBeInTheDocument()
      );
    }
  );

  // Counter-check: deep bare app routes still require an org and keep the
  // SubdomainAppWrapper redirect (only the AUTH entry was un-forced).
  it("still force-redirects a deep bare route (/review) to OrganizationPrompt", async () => {
    renderAtPath("/review");
    expect(await screen.findByTestId("page-organization-prompt")).toBeInTheDocument();
  });

  it("renders billing pages for /org/:id/billing/success and /cancel", async () => {
    renderAtPath("/org/acme/billing/success");
    expect(await screen.findByTestId("page-billing-success")).toBeInTheDocument();
    cleanup();
    renderAtPath("/org/acme/billing/cancel");
    expect(await screen.findByTestId("page-billing-cancel")).toBeInTheDocument();
  });

  it("renders PricingPage at /pricing", async () => {
    renderAtPath("/pricing");
    expect(await screen.findByTestId("page-pricing")).toBeInTheDocument();
  });

  it("renders UnsubscribePage at /unsubscribe/:token", async () => {
    renderAtPath("/unsubscribe/abc123");
    expect(await screen.findByTestId("page-unsubscribe")).toBeInTheDocument();
  });

  it("renders the 404 error page for an unknown path", async () => {
    renderAtPath("/this-path-does-not-exist");
    const el = await screen.findByTestId("page-error");
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute("data-code", "404");
  });
});
