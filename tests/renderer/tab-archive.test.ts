import { beforeEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("window", {
  electronAPI: {
    fsScanMetadata: vi.fn(() => Promise.resolve({ files: [], folders: [] })),
    fsExists: vi.fn().mockResolvedValue(true),
    fsRead: vi.fn().mockResolvedValue({ content: "" }),
    fsReadImage: vi.fn().mockResolvedValue({ dataUrl: "" }),
    fsReadBatch: vi.fn().mockResolvedValue({}),
    projectOpen: vi.fn().mockResolvedValue({ rootPath: "/p" }),
    projectActivate: vi.fn().mockResolvedValue({}),
    workbenchGetState: vi.fn().mockResolvedValue({ defaultLastPath: "" }),
    gitWarmup: vi.fn().mockResolvedValue(undefined),
    gitIsRepo: vi.fn().mockResolvedValue(false),
    workspaceGetConfig: vi.fn().mockResolvedValue([]),
    literatureList: vi.fn().mockResolvedValue([]),
    experimentList: vi.fn().mockResolvedValue({ ok: true, experiments: [] }),
    terminalCreate: vi.fn().mockResolvedValue({ shell: "/bin/zsh", cwd: "/p", pid: 1, tabId: "t" }),
    onTerminalData: vi.fn(() => () => {}),
    onTerminalExit: vi.fn(() => () => {}),
  },
});

import {
  archiveTabsForRoot,
  clearTabArchivesForTests,
  peekTabArchiveForTests,
  takeTabArchiveForRoot,
} from "../../src/renderer/lib/workspace/tab-archive";
import type { RightTab } from "../../src/renderer/lib/workspace/mode-registry";

const fileTab = (id: string, fileId: string, isPreview = false): RightTab => ({
  id,
  kind: "file",
  title: `${fileId}`,
  fileId,
  filePath: fileId,
  isInitial: false,
  isPreview,
});

describe("tab archive", () => {
  beforeEach(() => clearTabArchivesForTests());

  it("archives archivable tabs and skips previews / settings / job monitors", () => {
    const tabs: RightTab[] = [
      fileTab("t1", "docs/paper.tex"),
      { ...fileTab("t2", "draft.tex"), isPreview: true },
      { id: "t3", kind: "terminal", title: "shell", isInitial: false, terminalSource: "user", terminalCwd: "/p" },
      { id: "t4", kind: "terminal", title: "job", isInitial: false, terminalSource: "job-monitor" },
      { id: "t5", kind: "settings-editor", title: "settings", isInitial: false },
    ];
    archiveTabsForRoot("/p", tabs, "t1");
    const archive = peekTabArchiveForTests("/p");
    expect(archive?.tabs.map((t) => t.kind)).toEqual(["file", "terminal"]);
    expect(archive?.tabs[0]?.fileId).toBe("docs/paper.tex");
    expect(archive?.tabs[1]?.terminalCwd).toBe("/p");
    expect(archive?.activeIndex).toBe(0);
  });

  it("take consumes the archive", () => {
    archiveTabsForRoot("/p", [fileTab("t1", "a.tex")], "t1");
    expect(takeTabArchiveForRoot("/p")).not.toBeNull();
    expect(takeTabArchiveForRoot("/p")).toBeNull();
  });

  it("closing an empty area keeps the previous archive", () => {
    archiveTabsForRoot("/p", [fileTab("t1", "a.tex")], "t1");
    archiveTabsForRoot("/p", [], null);
    expect(peekTabArchiveForTests("/p")).not.toBeNull();
  });

  it("archives are per-root and bounded (oldest evicted)", () => {
    archiveTabsForRoot("/old", [fileTab("t1", "old.tex")], "t1");
    for (let i = 0; i < 15; i++) {
      archiveTabsForRoot(`/p${i}`, [fileTab("t1", `f${i}.tex`)], "t1");
    }
    expect(peekTabArchiveForTests("/old")).toBeNull();
    expect(peekTabArchiveForTests("/p14")).not.toBeNull();
  });
});
