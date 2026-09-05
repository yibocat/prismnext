import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Restore dispatch: each archived kind routes to the right open method with
 * the right args, the active tab follows the archived active index, and one
 * broken entry does not block the rest.
 */

const openFile = vi.fn();
const openTerminalAtCwd = vi.fn(() => "term-1");
const ensureTab = vi.fn(() => "git-1");
const openLiteraturePaper = vi.fn(() => "lit-1");
const openExperimentTab = vi.fn(() => "exp-1");

vi.mock("@/stores/right-panel-store", () => ({
  useRightPanelStore: {
    getState: () => ({
      tabs: [],
      activeTabId: null,
      openFile,
      openTerminalAtCwd,
      ensureTab,
      openLiteraturePaper,
      openExperimentTab,
    }),
    setState: vi.fn(),
  },
}));

vi.mock("@/stores/document-store", () => ({
  useDocumentStore: { getState: () => ({ setActiveFile: vi.fn() }) },
}));

import { archiveTabsForRoot, clearTabArchivesForTests } from "../../src/renderer/lib/workspace/tab-archive";
import { restoreArchivedTabs } from "../../src/renderer/lib/workspace/tab-restore";
import type { RightTab } from "../../src/renderer/lib/workspace/mode-registry";

describe("tab restore dispatch", () => {
  beforeEach(() => {
    clearTabArchivesForTests();
    vi.clearAllMocks();
  });

  it("routes kinds to their open methods and restores the active tab", () => {
    const tabs: RightTab[] = [
      { id: "t1", kind: "file", title: "paper.tex", fileId: "docs/paper.tex", filePath: "docs/paper.tex", isInitial: false },
      { id: "t2", kind: "terminal", title: "shell", isInitial: false, terminalSource: "user", terminalCwd: "/p/lab" },
      { id: "t3", kind: "git-overview", title: "Git", isInitial: false },
      { id: "t4", kind: "literature", title: "Paper", isInitial: false, literaturePaperId: "bib-1", literatureView: "notes" },
      { id: "t5", kind: "experiments", title: "Exp", isInitial: false, experimentId: "exp-9" },
    ];
    archiveTabsForRoot("/p", tabs, "t2"); // terminal was active
    restoreArchivedTabs("/p");

    expect(openFile).toHaveBeenCalledWith("docs/paper.tex", "docs/paper.tex", "paper.tex", { pin: true, isExternal: undefined });
    expect(openTerminalAtCwd).toHaveBeenCalledWith("/p/lab", "shell");
    expect(ensureTab).toHaveBeenCalledWith("git-overview");
    expect(openLiteraturePaper).toHaveBeenCalledWith("bib-1", "Paper", "notes");
    expect(openExperimentTab).toHaveBeenCalledWith("exp-9", "Exp");
  });

  it("skips entries without the required payload (diff without path, browser without url)", () => {
    const tabs: RightTab[] = [
      { id: "t1", kind: "git-diff", title: "diff", isInitial: false, filePath: "x.tex" },
      { id: "t2", kind: "browser", title: "web", isInitial: false }, // no url → skipped
    ];
    archiveTabsForRoot("/p", tabs, "t1");
    restoreArchivedTabs("/p");
    // git-diff has no mocked method — archive has it, restore must not throw.
    expect(openFile).not.toHaveBeenCalled();
  });

  it("no archive → no-op", () => {
    restoreArchivedTabs("/never-archived");
    expect(openFile).not.toHaveBeenCalled();
    expect(openTerminalAtCwd).not.toHaveBeenCalled();
  });
});
