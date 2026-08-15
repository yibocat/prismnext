import React, { Suspense } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserContent } from "@/modes/browser-mode/browser-content";
import { useLayoutStore } from "@/stores/layout-store";

vi.mock("@/modes/browser-mode/browser-view", () => ({
  BrowserView: () => <div data-testid="browser-view" />,
}));

const browserTab = {
  id: "browser:1",
  kind: "browser" as const,
  title: "Browser",
  isInitial: false,
  url: "https://example.com",
};

describe("BrowserContent", () => {
  beforeEach(() => {
    useLayoutStore.setState({ editorMaximized: true });
  });

  it("does not reserve a permanent bottom gutter when RightArea is maximized", async () => {
    render(
      <Suspense fallback={null}>
        <BrowserContent tab={browserTab} isActive />
      </Suspense>,
    );

    const browser = await screen.findByTestId("browser-view");
    expect(browser.parentElement?.className).not.toContain("pb-[var(--aibar-reserve-h)]");
  });
});
