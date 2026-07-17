import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RightPane } from "../../src/renderer/components/layout/right-pane";
import type { RightTab } from "../../src/renderer/lib/workspace/mode-registry";

vi.mock("../../src/renderer/components/layout/right-pane/content", () => ({
  PaneContent: ({
    activeTab,
    isActive,
  }: {
    activeTab: RightTab;
    isActive: boolean;
  }) => (
    <div data-testid={`pane-${activeTab.id}`} data-active={isActive ? "yes" : "no"}>
      {activeTab.title}
    </div>
  ),
}));

function tab(id: string, title: string): RightTab {
  return {
    id,
    kind: "file",
    title,
    fileId: `${id}.tex`,
    filePath: `${id}.tex`,
  } as RightTab;
}

describe("RightPane keep-alive", () => {
  it("keeps inactive tabs mounted (hidden) when switching", () => {
    const tabs = [tab("a", "A"), tab("b", "B")];
    const { rerender } = render(
      <RightPane tabs={tabs} activeTabId="a" />,
    );

    expect(screen.getByTestId("pane-a").getAttribute("data-active")).toBe("yes");
    expect(screen.getByTestId("pane-b").getAttribute("data-active")).toBe("no");

    rerender(<RightPane tabs={tabs} activeTabId="b" />);

    expect(screen.getByTestId("pane-a").getAttribute("data-active")).toBe("no");
    expect(screen.getByTestId("pane-b").getAttribute("data-active")).toBe("yes");
    // Both still in the document — not unmounted.
    expect(screen.getByText("A")).toBeTruthy();
    expect(screen.getByText("B")).toBeTruthy();
  });
});
