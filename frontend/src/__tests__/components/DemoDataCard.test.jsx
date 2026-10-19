import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Mock heavy dependencies so we can render the component in isolation
vi.mock("../../api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
  API_BASE_URL: "http://localhost:4000",
}));

vi.mock("../../auth", () => ({
  useAuth: () => ({ loading: false }),
}));

vi.mock("../../hooks/useOrgAccessGuard", () => ({
  useOrgAccessGuard: () => {},
}));

vi.mock("../../hooks/usePageTitle", () => ({
  usePageTitle: () => {},
}));

vi.mock("../../contexts", () => ({
  ThemeContext: React.createContext({ theme: "light" }),
  SettingsContext: React.createContext({ setPrimaryColor: vi.fn(), setLogoUrl: vi.fn() }),
}));

vi.mock("../../components/CategoryManager", () => ({
  default: () => <div data-testid="category-manager" />,
}));

vi.mock("../../components/AdminUserManager", () => ({
  default: () => <div data-testid="admin-user-manager" />,
}));

vi.mock("../../components/PlanLimitsCard", () => ({
  default: () => <div data-testid="plan-limits-card" />,
}));

vi.mock("../../components/RegistrationSettingsModal", () => ({
  default: ({ open }) => (open ? <div data-testid="registration-modal" /> : null),
}));

vi.mock("../../components/BulkUploadModal", () => ({
  default: ({ open }) => (open ? <div data-testid="bulk-upload-modal" /> : null),
}));

vi.mock("../../components/GeneralSettingsModal", () => ({
  default: ({ open }) => (open ? <div data-testid="general-settings-modal" /> : null),
}));

vi.mock("../../components/ProfanitySettingsModal", () => ({
  default: ({ open }) => (open ? <div data-testid="profanity-modal" /> : null),
}));

import { api } from "../../api";
import AdminSettings from "../../components/AdminSettings";

const superuserUser = { id: 1, username: "admin", isAdmin: true, isSuperuser: true };

const renderSettings = (demoDataLoaded = false) => {
  // Pre-seed localStorage so the component can load org settings
  localStorage.setItem("organizationId", "test-org");
  api.get.mockResolvedValue({ data: { organizationId: "test-org", demoDataLoaded } });

  return render(
    <MemoryRouter>
      <AdminSettings user={superuserUser} />
    </MemoryRouter>
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("DemoDataCard", () => {
  it('shows "Load Demo Data" button when demoDataLoaded is false', async () => {
    renderSettings(false);
    await waitFor(() => expect(screen.getByTestId("load-demo-data")).toBeInTheDocument());
    expect(screen.queryByTestId("remove-demo-data")).not.toBeInTheDocument();
  });

  it('shows "Remove Demo Data" button when demoDataLoaded is true', async () => {
    renderSettings(true);
    await waitFor(() => expect(screen.getByTestId("remove-demo-data")).toBeInTheDocument());
    expect(screen.queryByTestId("load-demo-data")).not.toBeInTheDocument();
  });

  it("calls POST /settings/demo-data when Load is clicked and flips to remove state", async () => {
    api.post.mockResolvedValue({ data: { success: true, ideaCount: 10 } });
    renderSettings(false);

    await waitFor(() => screen.getByTestId("load-demo-data"));
    fireEvent.click(screen.getByTestId("load-demo-data"));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/settings/demo-data"));
    await waitFor(() => expect(screen.getByTestId("remove-demo-data")).toBeInTheDocument());
  });

  it("calls DELETE /settings/demo-data when Remove is clicked and flips to load state", async () => {
    api.delete.mockResolvedValue({ data: { success: true, removedCount: 10 } });
    renderSettings(true);

    await waitFor(() => screen.getByTestId("remove-demo-data"));
    fireEvent.click(screen.getByTestId("remove-demo-data"));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/settings/demo-data"));
    await waitFor(() => expect(screen.getByTestId("load-demo-data")).toBeInTheDocument());
  });

  it("shows error message when load fails", async () => {
    api.post.mockRejectedValue({
      response: { data: { error: "Demo data is already loaded. Remove it first." } },
    });
    renderSettings(false);

    await waitFor(() => screen.getByTestId("load-demo-data"));
    fireEvent.click(screen.getByTestId("load-demo-data"));

    await waitFor(() =>
      expect(screen.getByText("Demo data is already loaded. Remove it first.")).toBeInTheDocument()
    );
  });
});
