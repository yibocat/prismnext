import { beforeEach, describe, expect, it, vi } from "vitest";

const selectExperiment = vi.fn().mockResolvedValue(null);
const refreshList = vi.fn().mockResolvedValue(undefined);
const clearSelection = vi.fn();

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
    getState: () => ({
      selectedId: "exp-a",
      experiments: [{ id: "exp-a", title: "Exp A" }],
      detail: { meta: { id: "exp-a", title: "Exp A" } },
      refreshList,
      selectExperiment,
      clearSelection,
    }),
  },
}));

vi.mock("../../src/renderer/stores/layout-store", () => ({
  useLayoutStore: {
    getState: () => ({
      editorMaximized: false,
      rightAreaExpanded: true,
      unmaximizeRightArea: vi.fn(),
      setLeftSidebarView: vi.fn(),
      requestRightAreaExpand: vi.fn(),
    }),
  },
}));

vi.mock("../../src/renderer/stores/right-panel-store", () => ({
  useRightPanelStore: {
    getState: () => ({
      ensureTab: vi.fn(),
      openExperimentTab: vi.fn(),
    }),
  },
}));

vi.mock("../../src/renderer/lib/workspace/left-nav/panel-refs", () => ({
  getLeftNavPanelRefs: () => ({}),
}));

vi.mock("../../src/renderer/lib/workspace/left-nav/panel-utils", () => ({
  openExperimentsSplit: vi.fn(),
}));

import { handleExperimentChanged } from "../../src/renderer/modes/experiments-mode/open-experiment";

describe("handleExperimentChanged", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refreshList.mockResolvedValue(undefined);
    selectExperiment.mockResolvedValue(null);
  });

  it("refreshes list but skips selectExperiment on run_complete", async () => {
    handleExperimentChanged({
      projectRoot: "/projects/demo",
      id: "exp-a",
      reason: "run_complete",
    });

    await refreshList.mock.results[0]?.value;
    expect(refreshList).toHaveBeenCalledWith("/projects/demo");
    expect(selectExperiment).not.toHaveBeenCalled();
  });

  it("re-selects the selected experiment after append_run", async () => {
    handleExperimentChanged({
      projectRoot: "/projects/demo",
      id: "exp-a",
      reason: "append_run",
    });

    await refreshList.mock.results[0]?.value;
    // Allow the .then continuation.
    await Promise.resolve();
    expect(selectExperiment).toHaveBeenCalledWith("/projects/demo", "exp-a");
  });

  it("clears selection when the selected experiment is deleted", async () => {
    handleExperimentChanged({
      projectRoot: "/projects/demo",
      id: "exp-a",
      reason: "delete",
    });

    expect(clearSelection).toHaveBeenCalled();
    await refreshList.mock.results[0]?.value;
    expect(selectExperiment).not.toHaveBeenCalled();
  });
});
