/**
 * RightArea Phase 1: closing tabs never resets to a persistent home shell.
 * Last tab of a mode exits the mode; home can close while detail tabs remain.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ModeDefinition, RightTab } from "@/lib/workspace/mode-registry";
import { modeRegistry } from "@/lib/workspace/mode-registry";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { hasMode } from "@/lib/workspace/modes-from-tabs";

vi.stubGlobal("window", {
  electronAPI: {
    terminalDestroyTab: vi.fn(),
    terminalDestroyTabs: vi.fn(),
  },
  confirm: vi.fn(() => true),
});

function ensureMode(def: ModeDefinition): void {
  if (!modeRegistry.get(def.id)) {
    modeRegistry.register(def);
  }
}

beforeAll(() => {
  const stub = (id: string, tabKinds: ModeDefinition["tabKinds"]): ModeDefinition => ({
    id,
    label: id,
    icon: null,
    tabKinds,
    initialTitle: id,
    Content: () => null,
  });
  ensureMode(stub("files", ["file"]));
  ensureMode(stub("literature", ["literature"]));
  ensureMode(stub("experiments", ["experiments"]));
  ensureMode(stub("browser", ["browser"]));
});

describe("tab close — transient (no home reset)", () => {
  beforeEach(() => {
    useRightPanelStore.setState({ tabs: [], activeTabId: null });
  });

  it("closing sole Files non-home tab exits files mode without recreating home", () => {
    const fileTab: RightTab = {
      id: "f1",
      kind: "file",
      title: "main.tex",
      isInitial: false,
      fileId: "main.tex",
      filePath: "main.tex",
    };
useRightPanelStore.setState({ tabs: [fileTab], activeTabId: "f1" });

    useRightPanelStore.getState().closeTab("f1");

    const { tabs } = useRightPanelStore.getState();
    expect(tabs).toHaveLength(0);
    expect(tabs.some((t) => t.kind === "file" && t.isInitial)).toBe(false);
    expect(hasMode(useRightPanelStore.getState().tabs, "files")).toBe(false);
  });

  it("closing sole Literature paper tab exits mode without ensure-home", () => {
    const paper: RightTab = {
      id: "lit-1",
      kind: "literature",
      title: "Attention",
      isInitial: false,
      literaturePaperId: "paper-1",
    };
useRightPanelStore.setState({ tabs: [paper], activeTabId: "lit-1" });

    useRightPanelStore.getState().closeTab("lit-1");

    expect(useRightPanelStore.getState().tabs).toHaveLength(0);
    expect(hasMode(useRightPanelStore.getState().tabs, "literature")).toBe(false);
  });

  it("closing Literature home while a paper tab remains keeps the paper", () => {
    const home: RightTab = {
      id: "lit-home",
      kind: "literature",
      title: "Library",
      isInitial: true,
    };
    const paper: RightTab = {
      id: "lit-1",
      kind: "literature",
      title: "Attention",
      isInitial: false,
      literaturePaperId: "paper-1",
    };
useRightPanelStore.setState({ tabs: [home, paper], activeTabId: "lit-home" });

    useRightPanelStore.getState().closeTab("lit-home");

    const { tabs, activeTabId } = useRightPanelStore.getState();
    expect(tabs.map((t) => t.id)).toEqual(["lit-1"]);
    expect(activeTabId).toBe("lit-1");
    expect(hasMode(useRightPanelStore.getState().tabs, "literature")).toBe(true);
  });

  it("closing sole Experiments detail tab exits mode without recreating home", () => {
    const detail: RightTab = {
      id: "exp-1",
      kind: "experiments",
      title: "run-a",
      isInitial: false,
      experimentId: "run-a",
    };
useRightPanelStore.setState({ tabs: [detail], activeTabId: "exp-1" });

    useRightPanelStore.getState().closeTab("exp-1");

    expect(useRightPanelStore.getState().tabs).toHaveLength(0);
    expect(hasMode(useRightPanelStore.getState().tabs, "experiments")).toBe(false);
  });

  it("closing sole Browser non-home tab exits without resetting to Browser home", () => {
    const page: RightTab = {
      id: "b1",
      kind: "browser",
      title: "example.com",
      isInitial: false,
      url: "https://example.com",
    };
useRightPanelStore.setState({ tabs: [page], activeTabId: "b1" });

    useRightPanelStore.getState().closeTab("b1");

    expect(useRightPanelStore.getState().tabs).toHaveLength(0);
    expect(hasMode(useRightPanelStore.getState().tabs, "browser")).toBe(false);
  });
});
