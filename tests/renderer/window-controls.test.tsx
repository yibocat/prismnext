/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { WindowControls } from "@/components/layout/window-controls";

let mockPlatform = "win32";
let mockMaximized = false;

vi.mock("@/hooks/use-window-state", () => ({
  useWindowState: () => ({
    platform: mockPlatform,
    isMaximized: mockMaximized,
    isFullscreen: false,
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string) => k,
  }),
}));

describe("WindowControls", () => {
  beforeEach(() => {
    mockPlatform = "win32";
    mockMaximized = false;
  });

  it("renders nothing on macOS (darwin)", () => {
    mockPlatform = "darwin";
    const { container } = render(<WindowControls />);
    expect(container.firstChild).toBeNull();
  });

  it("renders minimize, maximize, and close on Windows", () => {
    mockPlatform = "win32";
    const { container } = render(<WindowControls />);
    const buttons = container.querySelectorAll("button");
    expect(buttons).toHaveLength(3);
    expect(buttons[0]?.getAttribute("aria-label")).toBe("shell.minimize");
    expect(buttons[1]?.getAttribute("aria-label")).toBe("shell.maximize");
    expect(buttons[2]?.getAttribute("aria-label")).toBe("shell.close");
  });

  it("shows restore label when window is maximized", () => {
    mockPlatform = "win32";
    mockMaximized = true;
    const { container } = render(<WindowControls />);
    const buttons = container.querySelectorAll("button");
    expect(buttons[1]?.getAttribute("aria-label")).toBe("shell.restore");
  });
});
