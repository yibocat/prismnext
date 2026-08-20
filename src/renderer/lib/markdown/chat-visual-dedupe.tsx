import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { visualStemKey } from "./chat-artifact";

/**
 * One visible preview per logical figure in an assistant turn
 * (PNG / PDF / SVG of the same stem). Tool-card galleries opt out.
 */
const ChatVisualDedupeContext = createContext<Map<string, symbol> | null>(null);

export function ChatVisualDedupeProvider({
  messageKey,
  children,
}: {
  messageKey: string;
  children: ReactNode;
}) {
  const owners = useMemo(() => new Map<string, symbol>(), [messageKey]);
  return (
    <ChatVisualDedupeContext.Provider value={owners}>
      {children}
    </ChatVisualDedupeContext.Provider>
  );
}

export function useVisualStemClaim(path: string, enabled = true): boolean {
  const registry = useContext(ChatVisualDedupeContext);
  const instanceRef = useRef<symbol | null>(null);
  if (instanceRef.current === null) {
    instanceRef.current = Symbol("visual-stem");
  }
  const instance = instanceRef.current;
  const stem = enabled ? visualStemKey(path) : null;

  const [isOwner, setIsOwner] = useState(true);

  useLayoutEffect(() => {
    if (!registry || !stem) {
      setIsOwner(true);
      return;
    }
    const current = registry.get(stem);
    if (current === undefined) {
      registry.set(stem, instance);
      setIsOwner(true);
    } else {
      setIsOwner(current === instance);
    }
    return () => {
      if (registry.get(stem) === instance) {
        registry.delete(stem);
      }
    };
  }, [registry, stem, instance]);

  if (!registry || !stem) return true;
  const current = registry.get(stem);
  if (current !== undefined && current !== instance) return false;
  return isOwner;
}
