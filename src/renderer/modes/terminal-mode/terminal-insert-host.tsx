import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import type { Terminal } from "@xterm/xterm";
import { SelectionInsertAction } from "@/components/modules/shared/selection-insert-action";
import { insertTerminalToChat } from "@/lib/chat/insert-to-chat";
import {
  getTerminalSelectionAnchor,
  chipPositionFromAnchor,
  type TerminalSelectionAnchor,
} from "@/lib/terminal/selection-anchor";

interface TerminalInsertHostProps {
  tabId: string;
  isAi?: boolean;
  termRef: RefObject<Terminal | null>;
  termReadySignal?: number;
  children: ReactNode;
}

/** Selection chip → Add to Chat (top-right of selection, inside terminal panel). */
export function TerminalInsertHost({
  tabId,
  isAi = false,
  termRef,
  termReadySignal = 0,
  children,
}: TerminalInsertHostProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectionAnchor, setSelectionAnchor] = useState<TerminalSelectionAnchor | null>(null);
  const [chipPos, setChipPos] = useState<{ left: number; top: number } | null>(null);
  const selectionDisposableRef = useRef<{ dispose: () => void } | null>(null);

  const dismissAction = useCallback(() => {
    setSelectionAnchor(null);
    setChipPos(null);
  }, []);

  const updateActionPosition = useCallback(() => {
    const term = termRef.current;
    const container = containerRef.current;
    if (!term || !container) return;
    const text = term.getSelection().trim();
    if (!text) {
      dismissAction();
      return;
    }
    const anchor = getTerminalSelectionAnchor(term, container);
    if (!anchor) {
      dismissAction();
      return;
    }
    setSelectionAnchor(anchor);
    setChipPos(chipPositionFromAnchor(anchor, container));
  }, [termRef, dismissAction]);

  const runInsert = useCallback(() => {
    const term = termRef.current;
    const selection = term?.getSelection().trim() ?? "";
    if (!selection) return false;
    const ok = insertTerminalToChat({
      tabId,
      isAi,
      term,
      selection,
      quiet: true,
    });
    if (ok) {
      term?.clearSelection();
      dismissAction();
    }
    return ok;
  }, [tabId, isAi, termRef, dismissAction]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    selectionDisposableRef.current?.dispose();
    const disposable = term.onSelectionChange(() => {
      const text = term.getSelection().trim();
      if (!text) {
        setSelectionAnchor(null);
        return;
      }
      requestAnimationFrame(updateActionPosition);
    });
    selectionDisposableRef.current = disposable;

    const viewport = term.onScroll(() => {
      if (term.getSelection().trim()) {
        requestAnimationFrame(updateActionPosition);
      }
    });

    const onResize = () => {
      if (term.getSelection().trim()) {
        updateActionPosition();
      }
    };
    window.addEventListener("resize", onResize);

    return () => {
      disposable.dispose();
      viewport.dispose();
      window.removeEventListener("resize", onResize);
      selectionDisposableRef.current = null;
    };
  }, [termRef, tabId, termReadySignal, updateActionPosition]);

  useEffect(() => {
    if (!selectionAnchor) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "l") {
        e.preventDefault();
        runInsert();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectionAnchor, runInsert]);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      {children}
      <SelectionInsertAction
        open={!!selectionAnchor && !!chipPos}
        x={chipPos?.left ?? 0}
        y={chipPos?.top ?? 0}
        anchor="parent"
        align="start"
        variant="inline-chip"
        shortcut="⌘L"
        label="Add to Chat"
        onInsert={runInsert}
        onDismiss={dismissAction}
      />
    </div>
  );
}
