/**
 * openMode — singleton focuses; multi always spawns.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ModeDefinition } from "@/lib/workspace/mode-registry";
import { modeRegistry } from "@/lib/workspace/mode-registry";
import { useLayoutStore } from "@/stores/layout-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { focusedModeId, hasMode } from "@/lib/workspace/modes-from-tabs";

vi.stubGlobal("window", {
  electronAPI: {
    terminalDestroyTab: vi.fn(),
    terminalDestroyTabs: vi.fn(),
  },
});

function ensureMode(def: ModeDefinition): void {
  if (!modeRegistry.get(def.id)) {
    modeRegistry.register(def);
  }
}

beforeAll(() => {
  const stub = (
    id: string,
    tabKinds: ModeDefinition["tabKinds"],
    extra?: Partial<ModeDefinition>,
  ): ModeDefinition => ({
    id,
    label: id,
    icon: null,
    tabKinds,
    initialTitle: id,
    Content: () => null,
    ...extra,
  });
  ensureMode(stub("files", ["file"]));
  ensureMode(stub("terminal", ["terminal"], { addMenuPolicy: "multi" }));
  ensureMode(stub("browser", ["browser"], { addMenuPolicy: "multi" }));
  ensureMode(stub("literature", ["literature"], { addMenuPolicy: "multi" }));
  ensureMode(stub("git", ["git-overview", "git-diff"]));
});

describe("openMode", () => {
  beforeEach(() => {
    useRightPanelStore.setState({ tabs: [], activeTabId: null });
    useLayoutStore.setState({
      rightSidebarOpen: false,
    });
  });

  it("creates a Files home tab when none exist", async () => {
    const { openMode } = await import("@/lib/workspace/open-right-area-mode");
    openMode("files");
    const { tabs, activeTabId } = useRightPanelStore.getState();
    expect(tabs).toHaveLength(1);
    expect(tabs[0].kind).toBe("file");
    expect(tabs[0].isInitial).toBe(true);
    expect(activeTabId).toBe(tabs[0].id);
    expect(hasMode(useRightPanelStore.getState().tabs, "files")).toBe(true);
  });

  it("focuses an existing file tab instead of creating another home", async () => {
    const { openMode } = await import("@/lib/workspace/open-right-area-mode");
    useRightPanelStore.setState({
      tabs: [
        {
          id: "f1",
          kind: "file",
          title: "main.tex",
          isInitial: false,
          fileId: "main.tex",
          filePath: "main.tex",
        },
      ],
      activeTabId: "f1",
    });

    openMode("files");

    const { tabs } = useRightPanelStore.getState();
    expect(tabs).toHaveLength(1);
    expect(tabs[0].id).toBe("f1");
    expect(tabs.some((t) => t.isInitial)).toBe(false);
  });

  it("「+」Literature always spawns a new Library home even when papers are open", async () => {
    const { openMode } = await import("@/lib/workspace/open-right-area-mode");
    useRightPanelStore.setState({
      tabs: [
        { id: "f1", kind: "file", title: "a", isInitial: false, fileId: "a", filePath: "a" },
        {
          id: "lit-1",
          kind: "literature",
          title: "Paper",
          isInitial: false,
          literaturePaperId: "p1",
        },
      ],
      activeTabId: "f1",
    });

    openMode("literature");

    const { tabs, activeTabId } = useRightPanelStore.getState();
    expect(tabs).toHaveLength(3);
    const home = tabs.find((t) => t.id === activeTabId);
    expect(home).toMatchObject({ kind: "literature", isInitial: true });
    expect(home?.literaturePaperId).toBeUndefined();
    expect(focusedModeId(useRightPanelStore.getState().tabs, useRightPanelStore.getState().activeTabId)).toBe("literature");
  });

  it("shortcut focus reuses existing literature home instead of spawning", async () => {
    const { openMode } = await import("@/lib/workspace/open-right-area-mode");
    useRightPanelStore.setState({
      tabs: [
        { id: "lit-home", kind: "literature", title: "Library", isInitial: true },
        {
          id: "lit-1",
          kind: "literature",
          title: "Paper",
          isInitial: false,
          literaturePaperId: "p1",
        },
      ],
      activeTabId: null,
    });

    openMode("literature", { intent: "focus" });

    const st = useRightPanelStore.getState();
    expect(st.tabs).toHaveLength(2);
    expect(st.activeTabId).toBe("lit-home");
  });

  it("multi Terminal「+」always spawns another tab", async () => {
    const { openMode } = await import("@/lib/workspace/open-right-area-mode");
    useRightPanelStore.setState({
      tabs: [
        {
          id: "t1",
          kind: "terminal",
          title: "Shell",
          isInitial: false,
          terminalSource: "user",
        },
      ],
      activeTabId: "t1",
    });

    openMode("terminal");

    const { tabs } = useRightPanelStore.getState();
    expect(tabs).toHaveLength(2);
    expect(tabs.every((t) => t.kind === "terminal")).toBe(true);
  });
});
