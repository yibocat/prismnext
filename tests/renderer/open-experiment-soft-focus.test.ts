import { beforeEach, describe, expect, it, vi } from "vitest";

const { selectExperiment, refreshList, openExperimentsSplit, openExperimentTab } = vi.hoisted(() => ({
  selectExperiment: vi.fn().mockResolvedValue(null),
  refreshList: vi.fn().mockResolvedValue(undefined),
  openExperimentsSplit: vi.fn(),
  openExperimentTab: vi.fn(),
}));

vi.stubGlobal("window", {
  electronAPI: {
    onExperimentChanged: vi.fn(() => () => {}),
  },
});

vi.mock("../../src/renderer/stores/document-store", () => ({
  useDocumentStore: {
    getState: () => ({ projectRoot: "/projects/demo" }),
  },
}));

vi.mock("../../src/renderer/stores/experiment-store", () => ({
  useExperimentStore: {
    getState: () => storeState,
  },
}));

vi.mock("../../src/renderer/stores/right-panel-store", () => ({
  useRightPanelStore: {
    getState: () => ({
      openExperimentTab,
    }),
  },
}));

vi.mock("../../src/renderer/lib/workspace/left-nav/panel-refs", () => ({
  getLeftNavPanelRefs: () => ({}),
}));

vi.mock("../../src/renderer/lib/workspace/left-nav/panel-utils", () => ({
  openExperimentsSplit,
}));

let storeState: {
  selectedId: string | null;
  experiments: { id: string; title: string }[];
  detail: { meta: { id: string }; runs: unknown[]; runCount: number; lastRunAt: string | null } | null;
  refreshList: typeof refreshList;
  selectExperiment: typeof selectExperiment;
};

import { openExperimentInPanel } from "../../src/renderer/modes/experiments-mode/open-experiment";

describe("openExperimentInPanel soft-focus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeState = {
      selectedId: null,
      experiments: [],
      detail: null,
      refreshList,
      selectExperiment,
    };
  });

  it("skips selectExperiment when the island is already open", async () => {
    storeState.selectedId = "exp-a";
    storeState.experiments = [{ id: "exp-a", title: "Exp A" }];
    storeState.detail = {
      meta: { id: "exp-a" },
      runs: [],
      runCount: 2,
      lastRunAt: "2026-07-16T00:00:00Z",
    };

    await openExperimentInPanel("exp-a");

    expect(openExperimentsSplit).toHaveBeenCalled();
    expect(refreshList).not.toHaveBeenCalled();
    expect(selectExperiment).not.toHaveBeenCalled();
  });

  it("selects when a different island is requested", async () => {
    storeState.selectedId = "exp-a";
    storeState.experiments = [
      { id: "exp-a", title: "Exp A" },
      { id: "exp-b", title: "Exp B" },
    ];
    storeState.detail = {
      meta: { id: "exp-a" },
      runs: [],
      runCount: 1,
      lastRunAt: null,
    };

    await openExperimentInPanel("exp-b");

    expect(openExperimentsSplit).toHaveBeenCalled();
    expect(refreshList).toHaveBeenCalledWith("/projects/demo");
    expect(selectExperiment).toHaveBeenCalledWith("/projects/demo", "exp-b");
  });
});
