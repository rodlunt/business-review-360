import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import EmptyState from "../../components/EmptyState";
import { LightbulbOutlined } from "@mui/icons-material";

describe("EmptyState", () => {
  it("renders title and description", () => {
    render(<EmptyState title="No ideas yet" description="Submit the first idea." />);
    expect(screen.getByText("No ideas yet")).toBeInTheDocument();
    expect(screen.getByText("Submit the first idea.")).toBeInTheDocument();
  });

  it("renders primary CTA and calls onClick", () => {
    const onClick = vi.fn();
    render(
      <EmptyState title="No ideas yet" primaryAction={{ label: "Submit first idea", onClick }} />
    );
    fireEvent.click(screen.getByTestId("empty-state-primary"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders secondary CTA when provided", () => {
    const onSecondary = vi.fn();
    render(
      <EmptyState
        title="No ideas yet"
        primaryAction={{ label: "Submit", onClick: vi.fn() }}
        secondaryAction={{ label: "Invite team", onClick: onSecondary }}
      />
    );
    fireEvent.click(screen.getByTestId("empty-state-secondary"));
    expect(onSecondary).toHaveBeenCalledOnce();
  });

  it("omits secondary CTA when not provided", () => {
    render(
      <EmptyState title="No ideas yet" primaryAction={{ label: "Submit", onClick: vi.fn() }} />
    );
    expect(screen.queryByTestId("empty-state-secondary")).not.toBeInTheDocument();
  });

  it("renders icon when provided", () => {
    render(<EmptyState icon={LightbulbOutlined} title="No ideas yet" />);
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
  });

  it("has aria-live polite for screen readers", () => {
    render(<EmptyState title="No ideas yet" />);
    expect(screen.getByTestId("empty-state")).toHaveAttribute("aria-live", "polite");
  });
});
