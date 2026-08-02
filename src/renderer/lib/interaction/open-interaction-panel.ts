import { useLayoutStore } from "@/stores/layout-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useDocumentStore } from "@/stores/document-store";

/** Focus Interaction mode, expand RightArea, and open/focus a tab for this object id. */
export function openInteractionPanel(interactionId: string, title?: string): void {
  const layout = useLayoutStore.getState();
  if (!layout.editorMaximized) {
    layout.requestRightAreaExpand();
  }
  useRightPanelStore.getState().openInteractionTab(interactionId, title ?? interactionId);
}

function normalizeRoot(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/$/, "");
}

export interface InteractionChangedPayload {
  projectRoot: string;
  id: string;
  title?: string;
  reason: string;
  focus?: boolean;
}

export function handleInteractionChanged(data: InteractionChangedPayload): void {
  const projectRoot = useDocumentStore.getState().projectRoot;
  if (!projectRoot) return;
  if (normalizeRoot(projectRoot) !== normalizeRoot(data.projectRoot || "")) return;
  if (!data.focus || !data.id) return;
  openInteractionPanel(data.id, data.title);
}

const gChanged = globalThis as typeof globalThis & {
  __prismInteractionChangedUnsub?: (() => void) | null;
};
if (typeof window !== "undefined" && window.electronAPI?.onInteractionChanged) {
  gChanged.__prismInteractionChangedUnsub?.();
  gChanged.__prismInteractionChangedUnsub = window.electronAPI.onInteractionChanged((data) => {
    handleInteractionChanged(data);
  });
}
