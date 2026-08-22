/**
 * openExperimentTab — Files-like: replace Experiments home in place; else new detail tab.
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

vi.mock("@/stores/settings-store", () => ({
  useSettingsStore: {
    getState: () => ({
      trackRecentOpenedExperiment: vi.fn(),
    }),
  },
}));

beforeAll(() => {
  if (!modeRegistry.get("experiments")) {
    modeRegistry.register({
      id: "experiments",
      label: "Experiments",
      icon: null,
      tabKinds: ["experiments"],
      initialTitle: "Experiments",
      Content: () => null,
    } satisfies ModeDefinition);
  }
});

describe("openExperimentTab (Files-like)", () => {
  beforeEach(() => {
    useRightPanelStore.setState({ tabs: [], activeTabId: null });
  });

  it("replaces the Experiments home tab in place when opening the first experiment", () => {
    useRightPanelStore.setState({
      tabs: [
        {
          id: "exp-home",
          kind: "experiments",
          title: "Experiments",
          isInitial: true,
        },
      ],
      activeTabId: "exp-home",
    });

    const id = useRightPanelStore.getState().openExperimentTab("run-a", "Run A");

    const { tabs } = useRightPanelStore.getState();
    expect(id).toBe("exp-home");
    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toMatchObject({
      id: "exp-home",
      experimentId: "run-a",
      isInitial: false,
      title: "Run A",
    });
  });

  it("opens a second experiment as a new tab without recreating home", () => {
    useRightPanelStore.setState({
      tabs: [
        {
          id: "exp-1",
          kind: "experiments",
          title: "Run A",
          isInitial: false,
          experimentId: "run-a",
        },
      ],
      activeTabId: "exp-1",
    });

    const id = useRightPanelStore.getState().openExperimentTab("run-b", "Run B");

    const { tabs, activeTabId } = useRightPanelStore.getState();
    expect(id).not.toBe("exp-1");
    expect(activeTabId).toBe(id);
    expect(tabs).toHaveLength(2);
    expect(tabs.some((t) => t.isInitial && t.kind === "experiments")).toBe(false);
    expect(tabs.map((t) => t.experimentId).sort()).toEqual(["run-a", "run-b"]);
  });

  it("focuses an already-open experiment tab", () => {
    useRightPanelStore.setState({
      tabs: [
        {
          id: "exp-1",
          kind: "experiments",
          title: "Run A",
          isInitial: false,
          experimentId: "run-a",
        },
        {
          id: "exp-2",
          kind: "experiments",
          title: "Run B",
          isInitial: false,
          experimentId: "run-b",
        },
      ],
      activeTabId: "exp-2",
    });

    const id = useRightPanelStore.getState().openExperimentTab("run-a", "Run A");
    expect(id).toBe("exp-1");
    expect(useRightPanelStore.getState().activeTabId).toBe("exp-1");
    expect(useRightPanelStore.getState().tabs).toHaveLength(2);
  });
});
