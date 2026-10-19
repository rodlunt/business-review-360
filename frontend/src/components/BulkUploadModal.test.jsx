import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock the api module before importing the component (same hermetic pattern
// as LoginForm.test.jsx: the real module calls axios.create at import time).
vi.mock("../api", () => ({
  api: {
    post: vi.fn(),
    get: vi.fn(),
  },
  API_BASE_URL: "http://localhost:4000",
  setAuthToken: vi.fn(),
}));

import BulkUploadModal from "./BulkUploadModal";
import { api } from "../api";

// Issue #881: the modal must run the two-step preview-then-confirm flow
// against /users/bulk-upload/preview and /confirm. Control: the pre-#881
// modal posted once to the removed /users/bulk-upload endpoint, so every
// assertion here about the preview phase fails against it.

const PREVIEW_RESPONSE = {
  data: {
    summary: { total: 3, wouldCreate: 2, wouldSkip: 1 },
    accepted: [
      {
        row: 2,
        username: "john.doe",
        email: "john@example.com",
        isAdmin: false,
        hasPassword: true,
      },
      {
        row: 3,
        username: "jane.smith",
        email: "jane@example.com",
        isAdmin: true,
        hasPassword: false,
      },
    ],
    rejected: [{ row: 4, field: "email", message: "Email is required" }],
    previewToken: "signed-token-abc",
    fileHash: "hash123",
  },
};

const CONFIRM_RESPONSE = {
  data: {
    success: true,
    summary: { total: 3, successful: 2, failed: 1 },
    results: [
      { row: 2, username: "john.doe", email: "john@example.com", isAdmin: false },
      { row: 3, username: "jane.smith", email: "jane@example.com", isAdmin: true },
    ],
    errors: [{ row: 4, field: "email", message: "Email is required" }],
  },
};

function csvFile() {
  return new File(["username,email\njohn.doe,john@example.com"], "staff.csv", {
    type: "text/csv",
  });
}

async function selectFileAndPreview(user) {
  const input = document.getElementById("csv-file-input");
  await user.upload(input, csvFile());
  await user.click(screen.getByRole("button", { name: /preview import/i }));
}

describe("BulkUploadModal (#881 preview-then-confirm)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("previews without creating: calls the preview endpoint and shows the dry-run summary", async () => {
    const user = userEvent.setup();
    api.post.mockResolvedValueOnce(PREVIEW_RESPONSE);
    render(<BulkUploadModal open onClose={vi.fn()} onSuccess={vi.fn()} />);

    await selectFileAndPreview(user);

    await waitFor(() => {
      expect(screen.getByText(/no accounts have been created yet/i)).toBeInTheDocument();
    });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post.mock.calls[0][0]).toBe("/users/bulk-upload/preview");
    expect(screen.getByText(/2 of 3 rows will create accounts/i)).toBeInTheDocument();
    expect(screen.getByText("john.doe")).toBeInTheDocument();
    expect(screen.getByText(/setup invite email/i)).toBeInTheDocument();
    expect(screen.getByText("Email is required")).toBeInTheDocument();
    // The explicit confirm gate, named with the count.
    expect(screen.getByRole("button", { name: /create 2 accounts/i })).toBeEnabled();
  });

  it("confirm sends the same file plus the previewToken and reports the outcome", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    api.post.mockResolvedValueOnce(PREVIEW_RESPONSE).mockResolvedValueOnce(CONFIRM_RESPONSE);
    render(<BulkUploadModal open onClose={vi.fn()} onSuccess={onSuccess} />);

    await selectFileAndPreview(user);
    await user.click(await screen.findByRole("button", { name: /create 2 accounts/i }));

    await waitFor(() => {
      expect(screen.getByText(/import complete/i)).toBeInTheDocument();
    });
    expect(api.post).toHaveBeenCalledTimes(2);
    expect(api.post.mock.calls[1][0]).toBe("/users/bulk-upload/confirm");
    const confirmBody = api.post.mock.calls[1][1];
    expect(confirmBody.get("previewToken")).toBe("signed-token-abc");
    expect(confirmBody.get("file")).toBeInstanceOf(File);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/2 of 3 users created successfully/i)).toBeInTheDocument();
  });

  it("a zero-acceptance preview has no token and the confirm button stays disabled", async () => {
    const user = userEvent.setup();
    api.post.mockResolvedValueOnce({
      data: {
        summary: { total: 1, wouldCreate: 0, wouldSkip: 1 },
        accepted: [],
        rejected: [{ row: 2, field: "email", message: "Invalid email format" }],
        previewToken: null,
        fileHash: "hash123",
      },
    });
    render(<BulkUploadModal open onClose={vi.fn()} onSuccess={vi.fn()} />);

    await selectFileAndPreview(user);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create 0 accounts/i })).toBeDisabled();
    });
  });

  it("an expired preview token drops the flow back to the start with a re-preview message", async () => {
    const user = userEvent.setup();
    api.post.mockResolvedValueOnce(PREVIEW_RESPONSE).mockRejectedValueOnce({
      response: { data: { error: "Preview token has expired", code: "PREVIEW_TOKEN_EXPIRED" } },
    });
    render(<BulkUploadModal open onClose={vi.fn()} onSuccess={vi.fn()} />);

    await selectFileAndPreview(user);
    await user.click(await screen.findByRole("button", { name: /create 2 accounts/i }));

    await waitFor(() => {
      expect(screen.getByText(/please run the preview again/i)).toBeInTheDocument();
    });
    // Back at step 1: the preview action is offered again.
    expect(screen.getByRole("button", { name: /preview import/i })).toBeInTheDocument();
  });

  // Issue #984: username is optional in the bulk-import CSV; a row that
  // omits it is still accepted, with the actual name generated at confirm
  // time (not preview time). The preview table must not claim a specific
  // value it cannot guarantee.
  it("shows an auto-generated placeholder for an accepted row with no username", async () => {
    const user = userEvent.setup();
    api.post.mockResolvedValueOnce({
      data: {
        summary: { total: 1, wouldCreate: 1, wouldSkip: 0 },
        accepted: [
          { row: 2, username: null, email: "no.username@example.com", hasPassword: false },
        ],
        rejected: [],
        previewToken: "signed-token-no-username",
        fileHash: "hash456",
      },
    });
    render(<BulkUploadModal open onClose={vi.fn()} onSuccess={vi.fn()} />);

    await selectFileAndPreview(user);

    await waitFor(() => {
      expect(screen.getByText(/\(auto-generated\)/i)).toBeInTheDocument();
    });
    expect(screen.getByText("no.username@example.com")).toBeInTheDocument();
  });
});
