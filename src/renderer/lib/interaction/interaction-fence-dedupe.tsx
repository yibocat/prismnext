import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Registry of interaction-card owners, one per assistant message (text blocks
 * + tool peeks + auto-fallback). Maps interaction id → the symbol of the
 * component instance that owns the visible card.
 */
const InteractionFenceDedupeContext = createContext<Map<string, symbol> | null>(null);

/** One owner registry per assistant message (text blocks + auto-fallback). */
export function InteractionFenceDedupeProvider({
  messageKey,
  children,
}: {
  messageKey: string;
  children: ReactNode;
}) {
  const owners = useMemo(() => new Map<string, symbol>(), [messageKey]);
  return (
    <InteractionFenceDedupeContext.Provider value={owners}>
      {children}
    </InteractionFenceDedupeContext.Provider>
  );
}

/**
 * First mounted card for an id wins; later duplicates in the same turn render
 * nothing. Ownership is claimed in a layout effect (never during render) and
 * released on unmount, so streaming re-renders keep the card and a remount
 * (e.g. the live→settled flip) re-claims cleanly instead of losing the slot
 * to a stale render-phase entry. Layout timing resolves duplicate claims
 * before paint, so a duplicate card never flashes on screen.
 */
export function useInteractionFenceClaim(id: string): boolean {
  const registry = useContext(InteractionFenceDedupeContext);
  const instanceRef = useRef<symbol | null>(null);
  if (instanceRef.current === null) {
    instanceRef.current = Symbol("interaction-fence");
  }
  const instance = instanceRef.current;
  const norm = id.trim();

  const [isOwner, setIsOwner] = useState(true);

  useLayoutEffect(() => {
    if (!registry || !norm) {
      setIsOwner(true);
      return;
    }
    const current = registry.get(norm);
    if (current === undefined) {
      registry.set(norm, instance);
      setIsOwner(true);
    } else {
      setIsOwner(current === instance);
    }
    return () => {
      if (registry.get(norm) === instance) {
        registry.delete(norm);
      }
    };
  }, [registry, norm, instance]);

  if (!registry || !norm) return true;
  const current = registry.get(norm);
  // Another instance already owns this id — stay hidden even before our own
  // effect has resolved the claim.
  if (current !== undefined && current !== instance) return false;
  return isOwner;
}
