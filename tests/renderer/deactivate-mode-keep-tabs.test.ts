import { beforeEach, describe, expect, it, vi } from "vitest";

const closeTabsOfKind = vi.fn();
const setActiveTab = vi.fn();
const setState = vi.fn();

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

describe("closeModeTabs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    closeTabsOfKind.mockImplementation((_kind, opts?: { onClosed?: () => void }) => {
      opts?.onClosed?.();
    });
  });

  it("closes terminal tabs when retiring a mode", async () => {
    const { closeModeTabs } = await import(
      "../../src/renderer/lib/workspace/close-mode-tabs"
    );
    closeModeTabs("terminal");
    expect(closeTabsOfKind).toHaveBeenCalledWith("terminal", expect.any(Object));
  });
});
