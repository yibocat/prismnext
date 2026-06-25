import { useDocumentStore } from "@/stores/document-store";
import { useGitStore } from "@/stores/git-store";

/** Git status/diff root — follows checkout (worktree path when active). */
export function resolveGitRefreshRoot(): string | null {
  const { checkoutRoot, projectRoot } = useDocumentStore.getState();
  return checkoutRoot || projectRoot || null;
}

/** Align git unitRoot with checkout and debounce-refresh status (watcher / editor save). */
export function scheduleGitStatusRefresh(): void {
  const root = resolveGitRefreshRoot();
  if (!root) return;
  const gs = useGitStore.getState();
  if (gs.unitRoot !== root) {
    void gs.selectUnit(root);
    return;
  }
  if (gs.isGitRepo) {
    gs.scheduleAutoRefresh(root);
  }
}

/** Align git unitRoot with checkout and refresh status immediately (fs mutations). */
export function refreshGitStatusNow(): void {
  const root = resolveGitRefreshRoot();
  if (!root) return;
  const gs = useGitStore.getState();
  if (gs.unitRoot !== root) {
    void gs.selectUnit(root);
    return;
  }
  if (gs.isGitRepo) {
    void gs.refreshStatus(root);
  }
}
