import { beforeEach, describe, expect, it, vi } from "vitest";

const deactivateMode = vi.fn();
const closeTabsOfKind = vi.fn();
const setActiveTab = vi.fn();
const setState = vi.fn();

vi.mock("../../src/renderer/stores/layout-store", () => ({
  useLayoutStore: {
    getState: () => ({
      deactivateMode,
      focusedMode: "files",
    }),
  },
}));

vi.mock("../../src/renderer/stores/right-panel-store", () => ({
  useRightPanelStore: {
    getState: () => ({
      closeTabsOfKind,
      setActiveTab,
      tabs: [{ id: "f1", kind: "file" }],
    }),
    setState,
  },
}));

vi.mock("../../src/renderer/lib/workspace/mode-registry", () => ({
  modeRegistry: {
    get: (id: string) => {
      if (id === "terminal") {
        return { id: "terminal", tabKinds: ["terminal"] };
      }
      if (id === "files") {
        return { id: "files", tabKinds: ["file"] };
      }
      return undefined;
    },
    findByTabKind: () => undefined,
  },
}));

describe("deactivateModeFromToolbar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    closeTabsOfKind.mockImplementation((_kind, opts?: { onClosed?: () => void }) => {
      opts?.onClosed?.();
    });
  });

  it("closes terminal tabs when deactivating via shortcut / mode toggle", async () => {
    const { deactivateModeFromToolbar } = await import(
      "../../src/renderer/lib/workspace/deactivate-mode"
    );
    deactivateModeFromToolbar("terminal");
    expect(closeTabsOfKind).toHaveBeenCalledWith("terminal", expect.any(Object));
    expect(deactivateMode).toHaveBeenCalledWith("terminal");
  });
});
