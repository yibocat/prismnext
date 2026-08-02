/** In-flight staged citation add — one AbortController per stagedId. */

const controllers = new Map<string, AbortController>();

/** Cancel arrived after the prior add ended but before the next begin. */
const pendingCancelIds = new Set<string>();

export function beginStagedCitationAdd(stagedId: string): AbortSignal {
  pendingCancelIds.delete(stagedId);
  controllers.get(stagedId)?.abort();
  const controller = new AbortController();
  controllers.set(stagedId, controller);
  return controller.signal;
}

export function cancelStagedCitationAdd(stagedId: string): void {
  const existing = controllers.get(stagedId);
  if (existing) {
    existing.abort();
    controllers.delete(stagedId);
    return;
  }
  pendingCancelIds.add(stagedId);
}

export function endStagedCitationAdd(stagedId: string): void {
  controllers.delete(stagedId);
}

export function hasPendingStagedCitationAddCancel(stagedId: string): boolean {
  return pendingCancelIds.has(stagedId);
}
