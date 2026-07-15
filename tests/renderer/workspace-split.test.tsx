import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorkspaceSplit } from "../../src/renderer/components/layout/workspace-split";
import { useLayoutStore } from "../../src/renderer/stores/layout-store";

vi.mock("react-resizable-panels", () => ({
  Group: ({
    children,
    className,
    defaultLayout,
    onLayoutChanged,
  }: {
    children: React.ReactNode;
    className?: string;
    defaultLayout?: Record<string, number>;
    onLayoutChanged?: (layout: Record<string, number>) => void;
  }) => (
    <div
      data-testid="workspace-split-group"
      className={className}
      data-default-layout={JSON.stringify(defaultLayout ?? {})}
      data-has-layout-handler={onLayoutChanged ? "yes" : "no"}
    >
      {children}
    </div>
  ),
  Panel: ({
    children,
    id,
    defaultSize,
  }: {
    children: React.ReactNode;
    id?: string;
    defaultSize?: number;
  }) => (
    <div data-testid={`panel-${id}`} data-default-size={defaultSize}>
      {children}
    </div>
  ),
  Separator: ({ id }: { id?: string }) => <div data-testid={`sep-${id}`} />,
}));

describe("WorkspaceSplit", () => {
  beforeEach(() => {
    useLayoutStore.setState({ workspaceSplitLayouts: {} });
  });

  it("renders TeX panel ids and default sizes", () => {
    render(
      <WorkspaceSplit
        left={<span>PDF</span>}
        right={<span>Editor</span>}
        leftId="pdf"
        rightId="editor"
        defaultLeft={60}
      />,
    );

    expect(screen.getByTestId("panel-pdf").getAttribute("data-default-size")).toBe("60");
    expect(screen.getByTestId("panel-editor").getAttribute("data-default-size")).toBe("40");
    expect(screen.getByTestId("sep-sep-pdf")).toBeTruthy();
    expect(screen.getByText("PDF")).toBeTruthy();
    expect(screen.getByText("Editor")).toBeTruthy();
  });

  it("renders literature panel ids", () => {
    render(
      <WorkspaceSplit
        left={<span>Lit PDF</span>}
        right={<span>Notes</span>}
        leftId="lit-pdf"
        rightId="lit-notes"
        defaultLeft={55}
      />,
    );

    expect(screen.getByTestId("panel-lit-pdf").getAttribute("data-default-size")).toBe("55");
    expect(screen.getByTestId("panel-lit-notes").getAttribute("data-default-size")).toBe("45");
  });

  it("restores saved layout from layout-store", () => {
    useLayoutStore.setState({
      workspaceSplitLayouts: {
        "lit-pdf:lit-notes": { "lit-pdf": 62, "lit-notes": 38 },
      },
    });

    render(
      <WorkspaceSplit
        left={<span>Lit PDF</span>}
        right={<span>Notes</span>}
        leftId="lit-pdf"
        rightId="lit-notes"
        defaultLeft={55}
      />,
    );

    const group = screen.getByTestId("workspace-split-group");
    expect(group.getAttribute("data-default-layout")).toBe(
      JSON.stringify({ "lit-pdf": 62, "lit-notes": 38 }),
    );
    expect(group.getAttribute("data-has-layout-handler")).toBe("yes");
  });

  it("ignores saved layout when rightCollapsed is true", () => {
    useLayoutStore.setState({
      workspaceSplitLayouts: {
        "lit-pdf:lit-notes": { "lit-pdf": 62, "lit-notes": 38 },
      },
    });

    render(
      <WorkspaceSplit
        left={<span>Lit PDF</span>}
        right={<span>Notes</span>}
        leftId="lit-pdf"
        rightId="lit-notes"
        defaultLeft={55}
        rightCollapsed
      />,
    );

    const group = screen.getByTestId("workspace-split-group");
    expect(group.getAttribute("data-default-layout")).toBe(
      JSON.stringify({ "lit-pdf": 100, "lit-notes": 0 }),
    );
  });
});
