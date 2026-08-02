/**
 * Browser tab spawn — blank home tabs are multi-instance (Chrome-style +).
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ModeDefinition } from "@/lib/workspace/mode-registry";
import { modeRegistry } from "@/lib/workspace/mode-registry";
import { useRightPanelStore } from "@/stores/right-panel-store";

vi.stubGlobal("window", {
  electronAPI: {
    terminalDestroyTab: vi.fn(),
    terminalDestroyTabs: vi.fn(),
  },
});

beforeAll(() => {
  if (!modeRegistry.get("browser")) {
    modeRegistry.register({
      id: "browser",
      label: "Browser",
      icon: null,
      tabKinds: ["browser"],
      addMenuPolicy: "multi",
      initialTitle: "Browser",
      Content: () => null,
    } satisfies ModeDefinition);
  }
});

describe("newBrowserTab", () => {
  beforeEach(() => {
    useRightPanelStore.setState({ tabs: [], activeTabId: null });
  });

  it("creates another blank tab while sitting on an idle Browser home", () => {
    useRightPanelStore.setState({
      tabs: [
        { id: "b-home", kind: "browser", title: "Browser", isInitial: true },
      ],
      activeTabId: "b-home",
    });

    const id = useRightPanelStore.getState().newBrowserTab();

    const { tabs, activeTabId } = useRightPanelStore.getState();
    expect(id).not.toBe("b-home");
    expect(activeTabId).toBe(id);
    expect(tabs.filter((t) => t.kind === "browser" && t.isInitial)).toHaveLength(2);
  });

  it("creates a blank tab even when another idle home already exists", () => {
    useRightPanelStore.setState({
      tabs: [
        {
          id: "b1",
          kind: "browser",
          title: "example.com",
          isInitial: false,
          url: "https://example.com",
        },
        { id: "b-home", kind: "browser", title: "Browser", isInitial: true },
      ],
      activeTabId: "b1",
    });

    const id = useRightPanelStore.getState().newBrowserTab();
    expect(id).not.toBe("b-home");
    expect(useRightPanelStore.getState().tabs.filter((t) => t.kind === "browser")).toHaveLength(3);
  });
});
