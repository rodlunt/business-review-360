import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import OrgPickerModal from "./OrgPickerModal";

const MEMBERSHIPS = [
  { organizationId: "acme", orgName: "Acme Pty Ltd" },
  { organizationId: "globex", orgName: "Globex" },
  { organizationId: "demo-corp", orgName: "Demo Corp" },
];

function selectedValue() {
  // The checked radio's value: find the input[type=radio]:checked.
  const checked = document.querySelector('input[type="radio"]:checked');
  return checked ? checked.value : null;
}

describe("OrgPickerModal (Phase 3 Slice 4)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists every membership and pre-selects the primary org", () => {
    render(
      <OrgPickerModal
        memberships={MEMBERSHIPS}
        primaryOrganizationId="globex"
        currentOrganizationId="acme"
        onChoose={vi.fn()}
      />
    );

    expect(screen.getByTestId("org-option-acme")).toBeInTheDocument();
    expect(screen.getByTestId("org-option-globex")).toBeInTheDocument();
    expect(screen.getByTestId("org-option-demo-corp")).toBeInTheDocument();
    expect(selectedValue()).toBe("globex");
  });

  it("falls back to the current session org when there is no primary", () => {
    render(
      <OrgPickerModal
        memberships={MEMBERSHIPS}
        primaryOrganizationId={null}
        currentOrganizationId="demo-corp"
        onChoose={vi.fn()}
      />
    );
    expect(selectedValue()).toBe("demo-corp");
  });

  it("calls onChoose with the selected org on Continue", async () => {
    const user = userEvent.setup();
    const onChoose = vi.fn().mockResolvedValue(undefined);

    render(
      <OrgPickerModal
        memberships={MEMBERSHIPS}
        primaryOrganizationId="acme"
        currentOrganizationId="acme"
        onChoose={onChoose}
      />
    );

    await user.click(screen.getByTestId("org-option-globex"));
    await user.click(screen.getByTestId("org-picker-continue"));

    await waitFor(() => expect(onChoose).toHaveBeenCalledWith("globex"));
  });

  it("surfaces an error and stays open if the switch fails", async () => {
    const user = userEvent.setup();
    const onChoose = vi.fn().mockRejectedValue(new Error("network down"));

    render(
      <OrgPickerModal
        memberships={MEMBERSHIPS}
        primaryOrganizationId="acme"
        currentOrganizationId="acme"
        onChoose={onChoose}
      />
    );

    await user.click(screen.getByTestId("org-picker-continue"));

    await waitFor(() => expect(screen.getByText("network down")).toBeInTheDocument());
    // Still open, button re-enabled for a retry.
    expect(screen.getByTestId("org-picker-continue")).not.toBeDisabled();
  });
});
