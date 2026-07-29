import { createContext, useContext, useMemo, type ReactNode } from "react";

const InteractionFenceDedupeContext = createContext<Set<string> | null>(null);

/** One dedupe set per assistant message (text blocks + auto-fallback). */
export function InteractionFenceDedupeProvider({
  messageKey,
  children,
}: {
  messageKey: string;
  children: ReactNode;
}) {
  const seen = useMemo(() => new Set<string>(), [messageKey]);
  return (
    <InteractionFenceDedupeContext.Provider value={seen}>
      {children}
    </InteractionFenceDedupeContext.Provider>
  );
}

/** First card for an id wins; later duplicate fences in the same turn are skipped. */
export function claimInteractionFenceSlot(id: string): boolean {
  const seen = useContext(InteractionFenceDedupeContext);
  if (!seen) return true;
  const norm = id.trim();
  if (!norm || seen.has(norm)) return false;
  seen.add(norm);
  return true;
}
