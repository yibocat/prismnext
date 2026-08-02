/**
 * Literature tabs — Files-like home replace;「+」spawns another Library home.
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
  if (!modeRegistry.get("literature")) {
    modeRegistry.register({
      id: "literature",
      label: "Literature",
      icon: null,
      tabKinds: ["literature"],
      addMenuPolicy: "multi",
      initialTitle: "Library",
      Content: () => null,
    } satisfies ModeDefinition);
  }
});

describe("openLiteraturePaper (Files-like)", () => {
  beforeEach(() => {
    useRightPanelStore.setState({ tabs: [], activeTabId: null });
  });

  it("replaces the Library home tab in place when opening a paper", () => {
    useRightPanelStore.setState({
      tabs: [
        { id: "lit-home", kind: "literature", title: "Library", isInitial: true },
      ],
      activeTabId: "lit-home",
    });

    const id = useRightPanelStore
      .getState()
      .openLiteraturePaper("paper-1", "Attention Is All You Need");

    const { tabs } = useRightPanelStore.getState();
    expect(id).toBe("lit-home");
    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toMatchObject({
      id: "lit-home",
      literaturePaperId: "paper-1",
      isInitial: false,
      title: "Attention Is All You Need",
    });
  });

  it("opens another paper as a new tab when not on home", () => {
    useRightPanelStore.setState({
      tabs: [
        {
          id: "lit-1",
          kind: "literature",
          title: "Paper A",
          isInitial: false,
          literaturePaperId: "paper-a",
        },
      ],
      activeTabId: "lit-1",
    });

    const id = useRightPanelStore.getState().openLiteraturePaper("paper-b", "Paper B");
    const { tabs } = useRightPanelStore.getState();
    expect(id).not.toBe("lit-1");
    expect(tabs).toHaveLength(2);
    expect(tabs.some((t) => t.isInitial)).toBe(false);
  });
});

describe("newLiteratureHomeTab", () => {
  beforeEach(() => {
    useRightPanelStore.setState({ tabs: [], activeTabId: null });
  });

  it("spawns another Library home even when a paper tab is open", () => {
    useRightPanelStore.setState({
      tabs: [
        {
          id: "lit-1",
          kind: "literature",
          title: "Paper A",
          isInitial: false,
          literaturePaperId: "paper-a",
        },
      ],
      activeTabId: "lit-1",
    });

    const id = useRightPanelStore.getState().newLiteratureHomeTab();
    const { tabs, activeTabId } = useRightPanelStore.getState();
    expect(activeTabId).toBe(id);
    expect(tabs).toHaveLength(2);
    expect(tabs.find((t) => t.id === id)).toMatchObject({
      kind: "literature",
      isInitial: true,
    });
    expect(tabs.find((t) => t.id === id)?.literaturePaperId).toBeUndefined();
  });
});

describe("Literature stays in add menu when open", () => {
  it("keeps literature visible under multi policy", () => {
    const visible = modeRegistry.getVisibleAddMenuModes("workspace", ["literature"]);
    expect(visible.map((m) => m.id)).toContain("literature");
  });
});
