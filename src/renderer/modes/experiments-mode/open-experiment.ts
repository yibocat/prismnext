/**
 * Programmatic Experiments navigation — chat tool deep-link + Agent
 * `experiment-log open` + registry-changed auto-refresh.
 *
 * Deep-links from Chat / Agent open Experiments as a normal RightArea split
 * (never maximized). Left-nav still uses `openExperimentsPanel` for full-bleed.
 */
import { useDocumentStore } from "@/stores/document-store";
import { useExperimentStore } from "@/stores/experiment-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { getLeftNavPanelRefs } from "@/lib/workspace/left-nav/panel-refs";
import { closeTexWorkspace } from "@/lib/workspace/left-nav/panel-utils";

function normalizeRoot(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/$/, "");
}

/**
 * Open Experiments mode beside chat (split RightArea) and select an island.
 * Does NOT maximize — Chat ↔ Experiments deep-links keep the center chat visible.
 */
export async function openExperimentInPanel(experimentId: string): Promise<void> {
  const id = (experimentId || "").trim();
  const projectRoot = useDocumentStore.getState().projectRoot;
  if (!id || !projectRoot) return;

  const panelRefs = getLeftNavPanelRefs();
  const ctx = { panelRefs };
  const layout = useLayoutStore.getState();
  const rp = useRightPanelStore.getState();

  // Leaving TeX / other maximized fullscreen modes; keep Experiments split with chat.
  closeTexWorkspace(ctx);

  if (layout.editorMaximized) {
    layout.unmaximizeRightArea();
  }

  rp.ensureTab("experiments");
  layout.setLeftSidebarView("sessions");
  layout.activateMode("experiments");

  // Split with center chat — never maximize. Expand RightArea if it was collapsed.
  if (!useLayoutStore.getState().rightAreaExpanded) {
    useLayoutStore.getState().requestRightAreaExpand();
  }

  const store = useExperimentStore.getState();
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
  const projectRoot = useDocumentStore.getState().projectRoot;
  if (!projectRoot) return;
  if (normalizeRoot(projectRoot) !== normalizeRoot(data.projectRoot || "")) return;

  if (data.focus && data.id) {
    void openExperimentInPanel(data.id);
    return;
  }

  const store = useExperimentStore.getState();
  const selectedId = store.selectedId;
  void store.refreshList(projectRoot).then(() => {
    if (data.id && selectedId === data.id) {
      void useExperimentStore.getState().selectExperiment(projectRoot, data.id);
    }
  });
}

// Subscribe once when this module is imported (wired from experiment-store).
if (typeof window !== "undefined" && window.electronAPI?.onExperimentChanged) {
  window.electronAPI.onExperimentChanged((data) => {
    handleExperimentChanged(data);
  });
}
