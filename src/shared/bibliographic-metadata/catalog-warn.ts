/** Dedupe catalog failure logs — Agent batch stage can hit the same 429 hundreds of times. */
const lastWarnAt = new Map<string, number>();
const WARN_COOLDOWN_MS = 30_000;

export function warnCatalogFailure(sourceId: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  const key = `${sourceId}:${msg}`;
  const now = Date.now();
  const prev = lastWarnAt.get(key);
  if (prev != null && now - prev < WARN_COOLDOWN_MS) return;
  lastWarnAt.set(key, now);
  console.warn(`[bibliographic-metadata] ${sourceId} failed: ${msg}`);
}

/** @internal test helper */
export function resetCatalogWarnDedupeForTests(): void {
  lastWarnAt.clear();
}
