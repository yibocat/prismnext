import { useDocumentStore } from "@/stores/document-store";
import { useIntensiveReadingStore } from "@/stores/intensive-reading-store";

/** Persist intensive paper IDs for a session and sync bibkeys to the main process. */
export function persistAndSyncIntensiveReading(
  sessionId: string | null | undefined,
  paperIds: string[],
): void {
  const id = sessionId?.trim();
  if (!id) return;

  useIntensiveReadingStore.getState().setForSession(id, paperIds);

  const projectRoot = useDocumentStore.getState().projectRoot;
  if (!projectRoot) return;

  void window.electronAPI.agentSyncIntensiveReading({
    conversationId: id,
    projectRoot,
    paperIds,
  });
}

/** Resolve intensive paper IDs when a tab binds to a session. */
export function resolveIntensivePaperIdsForSession(
  sessionId: string,
  tabPaperIds: string[],
): string[] {
  const stored = useIntensiveReadingStore.getState().getForSession(sessionId);
  if (stored.length > 0) return stored;
  return tabPaperIds;
}
