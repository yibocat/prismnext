import { beforeEach, describe, expect, it, vi } from "vitest";

const selectExperiment = vi.fn().mockResolvedValue(null);
const refreshList = vi.fn().mockResolvedValue(undefined);

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

const ensureTab = vi.fn();
const activateMode = vi.fn();
const setLeftSidebarView = vi.fn();
const unmaximizeRightArea = vi.fn();
const requestRightAreaExpand = vi.fn();

vi.mock("../../src/renderer/stores/layout-store", () => ({
  useLayoutStore: {
    getState: () => ({
      editorMaximized: false,
      rightAreaExpanded: true,
      unmaximizeRightArea,
      setLeftSidebarView,
      activateMode,
      requestRightAreaExpand,
    }),
  },
}));

vi.mock("../../src/renderer/stores/right-panel-store", () => ({
  useRightPanelStore: {
    getState: () => ({
      ensureTab,
    }),
  },
}));

vi.mock("../../src/renderer/lib/workspace/left-nav/panel-refs", () => ({
  getLeftNavPanelRefs: () => ({}),
}));

vi.mock("../../src/renderer/lib/workspace/left-nav/panel-utils", () => ({
  closeTexWorkspace: vi.fn(),
}));

let storeState: {
  selectedId: string | null;
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
      detail: null,
      refreshList,
      selectExperiment,
    };
  });

  it("skips selectExperiment when the island is already open", async () => {
    storeState.selectedId = "exp-a";
    storeState.detail = {
      meta: { id: "exp-a" },
      runs: [],
      runCount: 2,
      lastRunAt: "2026-07-16T00:00:00Z",
    };

    await openExperimentInPanel("exp-a");

    expect(activateMode).toHaveBeenCalledWith("experiments");
    expect(refreshList).not.toHaveBeenCalled();
    expect(selectExperiment).not.toHaveBeenCalled();
  });

  it("selects when a different island is requested", async () => {
    storeState.selectedId = "exp-a";
    storeState.detail = {
      meta: { id: "exp-a" },
      runs: [],
      runCount: 1,
      lastRunAt: null,
    };

    await openExperimentInPanel("exp-b");

    expect(refreshList).toHaveBeenCalledWith("/projects/demo");
    expect(selectExperiment).toHaveBeenCalledWith("/projects/demo", "exp-b");
  });
});
