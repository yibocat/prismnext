import type { RightTab } from "@/lib/workspace/mode-registry";

/**
 * Per-project workbench tab archive.
 *
 * `applyWorkbenchFocusChange` closes every RightArea tab when the focused
 * project changes (data-isolation requirement: git status / diffs / worktree
 * lists must not leak across projects). That also threw away the user's
 * working set. This module remembers the tab list per project root so
 * returning to a project can restore it.
 *
 * NOT archived: terminal tabs' PTYs (they die with the close; restoration
 * re-creates the tab and the terminal view spawns a fresh PTY with the same
 * tabId + cwd), settings-editor tabs (app-level, not project data), and
 * preview-mode tabs (transient by definition).
 */

interface ArchivedTab {
  kind: RightTab["kind"];
  title: string;
  fileId?: string;
  filePath?: string;
  isExternal?: boolean;
  viewMode?: string;
  url?: string;
  terminalCwd?: string;
  terminalSource?: "user" | "job-monitor";
  literaturePaperId?: string;
  literatureView?: "grid" | "reader" | "notes";
  experimentId?: string;
  experimentsView?: "list" | "detail";
  experimentsDetailTab?: "overview" | "run" | "results";
  interactionId?: string;
}

interface TabArchive {
  tabs: ArchivedTab[];
  activeIndex: number;
  archivedAt: number;
}

const MAX_ARCHIVED_PROJECTS = 12;

const archives = new Map<string, TabArchive>();

/** Tabs worth remembering. Job monitors / AI terminals are chat-linked and rebuilt by their flows. */
function isArchivableTab(tab: RightTab): boolean {
  if (tab.isPreview) return false;
  switch (tab.kind) {
    case "file":
    case "research-plan":
    case "browser":
    case "git-overview":
      return true;
    case "terminal":
      return tab.terminalSource === "user";
    case "literature":
    case "experiments":
    case "interaction":
      return true;
    case "git-diff":
      return Boolean(tab.filePath);
    case "settings-editor":
      return false;
  }
}

function toArchived(tab: RightTab): ArchivedTab {
  const archived: ArchivedTab = { kind: tab.kind, title: tab.title };
  if ("fileId" in tab && tab.fileId) archived.fileId = tab.fileId;
  if ("filePath" in tab && tab.filePath) archived.filePath = tab.filePath;
  if ("isExternal" in tab && tab.isExternal) archived.isExternal = true;
  if ("viewMode" in tab && tab.viewMode) archived.viewMode = tab.viewMode;
  if ("url" in tab && tab.url) archived.url = tab.url;
  if ("terminalCwd" in tab && tab.terminalCwd) archived.terminalCwd = tab.terminalCwd;
  if (tab.kind === "terminal" && tab.terminalSource === "user") archived.terminalSource = "user";
  if ("literaturePaperId" in tab && tab.literaturePaperId) archived.literaturePaperId = tab.literaturePaperId;
  if ("literatureView" in tab && tab.literatureView) archived.literatureView = tab.literatureView;
  if ("experimentId" in tab && tab.experimentId) archived.experimentId = tab.experimentId;
  if ("experimentsView" in tab && tab.experimentsView) archived.experimentsView = tab.experimentsView;
  if ("experimentsDetailTab" in tab && tab.experimentsDetailTab) archived.experimentsDetailTab = tab.experimentsDetailTab;
  if ("interactionId" in tab && tab.interactionId) archived.interactionId = tab.interactionId;
  return archived;
}

/** Snapshot the given tabs for this project root. Call BEFORE closing them. */
export function archiveTabsForRoot(projectRoot: string | null | undefined, tabs: RightTab[], activeTabId: string | null): void {
  if (!projectRoot) return;
  const archivable = tabs.filter(isArchivableTab);
  if (archivable.length === 0) return; // keep any older archive — closing an empty area must not wipe it
  const activeIndex = Math.max(0, archivable.findIndex((t) => t.id === activeTabId));
  archives.set(projectRoot, {
    tabs: archivable.map(toArchived),
    activeIndex,
    archivedAt: Date.now(),
  });
  while (archives.size > MAX_ARCHIVED_PROJECTS) {
    const oldest = [...archives.entries()]
      .sort((a, b) => a[1].archivedAt - b[1].archivedAt)[0];
    if (!oldest) break;
    archives.delete(oldest[0]);
  }
}

export function takeTabArchiveForRoot(projectRoot: string | null | undefined): TabArchive | null {
  if (!projectRoot) return null;
  const archive = archives.get(projectRoot) ?? null;
  if (archive) archives.delete(projectRoot);
  return archive;
}

/** Test / reset helper. */
export function clearTabArchivesForTests(): void {
  archives.clear();
}

/** Test-only: peek without consuming. */
export function peekTabArchiveForTests(projectRoot: string): TabArchive | null {
  return archives.get(projectRoot) ?? null;
}
