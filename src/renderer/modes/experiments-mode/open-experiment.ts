/**
 * Programmatic Experiments navigation — chat tool deep-link + Agent
 * `experiment-log open` + registry-changed auto-refresh.
 *
 * Deep-links from Chat / Agent open Experiments as a normal RightArea split
 * (never maximized). Left-nav still uses `openExperimentsPanel` for full-bleed.
 */
import { useExperimentStore } from "@/stores/experiment-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { getLeftNavPanelRefs } from "@/lib/workspace/left-nav/panel-refs";
import { closeTexWorkspace } from "@/lib/workspace/left-nav/panel-utils";
import { getExperimentProjectRoot } from "./experiments-project-root";

function normalizeRoot(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/$/, "");
}

/** Ensure Experiments is visible in a split RightArea (chat stays visible). */
function ensureExperimentsPanelChrome(): void {
  const panelRefs = getLeftNavPanelRefs();
  const ctx = { panelRefs };
  const layout = useLayoutStore.getState();
  const rp = useRightPanelStore.getState();

  closeTexWorkspace(ctx);

  if (layout.editorMaximized) {
    layout.unmaximizeRightArea();
  }

  rp.ensureTab("experiments");
  layout.setLeftSidebarView("sessions");
  layout.activateMode("experiments");

  if (!useLayoutStore.getState().rightAreaExpanded) {
    useLayoutStore.getState().requestRightAreaExpand();
  }
}

/**
 * Open Experiments mode beside chat (split RightArea) and select an island.
 * Does NOT maximize — Chat ↔ Experiments deep-links keep the center chat visible.
 *
 * Soft-focus (Bug #12 / Phase 3): if this island is already selected with detail
 * loaded, skip `selectExperiment` so an expanded runs-table row is not collapsed.
 */
export async function openExperimentInPanel(experimentId: string): Promise<void> {
  const id = (experimentId || "").trim();
  const projectRoot = getExperimentProjectRoot();
  if (!id || !projectRoot) return;

  ensureExperimentsPanelChrome();

  const store = useExperimentStore.getState();
  const title =
    store.experiments.find((e) => e.id === id)?.title ??
    (store.detail?.meta.id === id ? store.detail.meta.title : id);
  useRightPanelStore.getState().openExperimentTab(id, title);

  // Soft-focus: already showing this island — don't re-fetch / collapse runs.
  if (store.selectedId === id && store.detail?.meta.id === id) {
    return;
  }

  await store.refreshList(projectRoot);
  await store.selectExperiment(projectRoot, id);
}

/** Resolve experiment id from tool input / result payload (for chat widgets). */
export function resolveExperimentIdFromTool(
  input: Record<string, unknown>,
  data: Record<string, unknown> | null,
): string | null {
  const fromInput = typeof input.id === "string" ? input.id.trim() : "";
  if (fromInput) return fromInput;
  if (!data) return null;
  if (typeof data.id === "string" && data.id.trim()) return data.id.trim();
  const meta = data.meta;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const mid = (meta as { id?: unknown }).id;
    if (typeof mid === "string" && mid.trim()) return mid.trim();
  }
  return null;
}

export interface ExperimentChangedPayload {
  projectRoot: string;
  id?: string;
  reason: string;
  focus?: boolean;
}

export function handleExperimentChanged(data: ExperimentChangedPayload): void {
  const projectRoot = getExperimentProjectRoot();
  if (!projectRoot) return;
  if (normalizeRoot(projectRoot) !== normalizeRoot(data.projectRoot || "")) return;

  if (data.focus && data.id) {
    void openExperimentInPanel(data.id);
    return;
  }

  const store = useExperimentStore.getState();
  const selectedId = store.selectedId;

  if (data.reason === "delete" && data.id && selectedId === data.id) {
    store.clearSelection();
    void store.refreshList(projectRoot);
    return;
  }

  void store.refreshList(projectRoot).then(() => {
    if (!data.id || selectedId !== data.id) return;
    // run_complete already patches detail via onExperimentRunComplete —
    // re-select races that path and can briefly flash a spinner or
    // duplicate the run before handleRunComplete dedup kicks in.
    if (data.reason === "run_complete") return;
    void useExperimentStore.getState().selectExperiment(projectRoot, data.id);
  });
}

// Subscribe once when this module is imported (wired from experiment-store).
// Persist unsub on globalThis so Vite HMR can tear down the prior listener (Bug #13).
const gChanged = globalThis as typeof globalThis & {
  __prismExperimentChangedUnsub?: (() => void) | null;
};
if (typeof window !== "undefined" && window.electronAPI?.onExperimentChanged) {
  gChanged.__prismExperimentChangedUnsub?.();
  gChanged.__prismExperimentChangedUnsub = window.electronAPI.onExperimentChanged((data) => {
    handleExperimentChanged(data);
  });
}
