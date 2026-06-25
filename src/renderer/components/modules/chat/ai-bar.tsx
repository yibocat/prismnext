import { useRef, useState, useEffect, useCallback } from "react";
import { Kbd } from "@/components/ui/kbd";
import { ChatComposerCore } from "./chat-composer-core";
import { ChatMessages } from "./chat-messages";
import { RestoreUndoBar } from "./restore-undo-bar";
import { useChatStore } from "@/stores/chat-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useComposerInsertStore } from "@/stores/composer-insert-store";
import { useComposerEditorStore } from "@/stores/composer-editor-store";
import { composerNeedsExpandedLayout } from "@/hooks/use-chat-composer";
import { isComposerEmpty } from "@/lib/chat/composer-parts";
import { loadDraftParts } from "./inline-composer";
import { XIcon } from "lucide-react";
import { WorktreeSelector } from "./worktree-selector";
import { cn } from "@/lib/utils";

/** idle: hover pill · input: compact capsule · expanded: full composer */
type Phase = "idle" | "input" | "expanded";

export function AiBar() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [panelClosing, setPanelClosing] = useState(false);
  const panelClosingRef = useRef(false);
  panelClosingRef.current = panelClosing;

  const openPanel = useCallback(() => setIsPanelOpen(true), []);
  const closePanel = useCallback(() => {
    if (panelClosingRef.current) return;
    setPanelClosing(true);
    setTimeout(() => {
      setIsPanelOpen(false);
      setPanelClosing(false);
    }, 150);
  }, []);

  const composerShellRef = useRef<HTMLDivElement>(null);
  const morphRef = useRef<HTMLDivElement>(null);

  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const tabDraft = useChatStore(
    (s) => s.tabs.find((t) => t.id === s.activeTabId)?.draft,
  );
  const activeTabTitle = useChatStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return tab?.title ?? "Chat";
  });

  const aiBarComposerFocusNonce = useLayoutStore((s) => s.aiBarComposerFocusNonce);
  const pendingInsert = useComposerInsertStore((s) => s.pendingInsert);

  const draftParts = loadDraftParts(tabDraft);
  const draftEmpty = isComposerEmpty(draftParts);
  const draftEmptyRef = useRef(draftEmpty);
  draftEmptyRef.current = draftEmpty;

  const hasConversation = messages.length > 0 || isStreaming;
  const isInputting = phase === "input";
  const isExpanded = phase === "expanded";
  const isComposerVisible = phase !== "idle";

  const focusComposer = useCallback(() => {
    requestAnimationFrame(() => {
      useComposerEditorStore.getState().handle?.focus();
    });
  }, []);

  const openInput = useCallback(() => {
    setPhase("input");
    focusComposer();
  }, [focusComposer]);

  const openExpanded = useCallback(() => {
    setPhase("expanded");
    focusComposer();
  }, [focusComposer]);

  const collapseToIdle = useCallback(() => {
    setPhase("idle");
  }, []);

  const collapseToInput = useCallback(() => {
    setPhase("input");
    focusComposer();
  }, [focusComposer]);

  // Restore compact capsule when draft has content (e.g. after tab switch)
  useEffect(() => {
    if (phase === "idle" && !draftEmpty) {
      setPhase("input");
    }
  }, [phase, draftEmpty]);

  useEffect(() => {
    if (aiBarComposerFocusNonce === 0) return;
    const expandForInsert =
      pendingInsert?.kind === "code" ||
      pendingInsert?.kind === "git-diff" ||
      pendingInsert?.kind === "terminal";
    if (expandForInsert) openExpanded();
    else openInput();
  }, [aiBarComposerFocusNonce, openExpanded, openInput, pendingInsert?.kind]);

  // Expand only for explicit newlines in draft — line-full overflow handled in editor
  useEffect(() => {
    if (phase !== "input") return;
    if (composerNeedsExpandedLayout(draftParts)) {
      setPhase("expanded");
    }
  }, [draftParts, phase]);

  // Shrink back to compact capsule when expanded content is cleared
  useEffect(() => {
    if (phase === "expanded" && draftEmpty) {
      collapseToInput();
    }
  }, [phase, draftEmpty, collapseToInput]);

  // Click outside → idle when compact capsule is empty
  useEffect(() => {
    if (phase !== "input" || isPanelOpen) return;

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (composerShellRef.current?.contains(target)) return;
      if (target.closest("[data-radix-menu-content]") || target.closest("[data-radix-popper-content-wrapper]")) return;
      if (draftEmptyRef.current) collapseToIdle();
    };

    document.addEventListener("mousedown", handleMouseDown, true);
    return () => document.removeEventListener("mousedown", handleMouseDown, true);
  }, [phase, isPanelOpen, collapseToIdle]);

  useEffect(() => {
    if (!isPanelOpen) return;

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-ai-bar-panel]")) return;
      if (composerShellRef.current?.contains(target)) return;
      if (target.closest("[data-radix-menu-content]") || target.closest("[data-radix-popper-content-wrapper]")) return;
      closePanel();
    };

    document.addEventListener("mousedown", handleMouseDown, true);
    return () => document.removeEventListener("mousedown", handleMouseDown, true);
  }, [isPanelOpen, closePanel]);

  const toolbar = !isPanelOpen && (
    <div
      className={cn(
        "flex items-center pointer-events-auto transition-all duration-200 ease-out",
        isComposerVisible
          ? "h-7 mb-2 opacity-100 translate-y-0"
          : "h-0 mb-0 opacity-0 -translate-y-1 overflow-hidden",
      )}
    >
      {hasConversation && (
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[length:var(--font-chat-meta)] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors mr-1"
          onClick={openPanel}
        >
          {isStreaming ? (
            <>
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
              </span>
              Running
            </>
          ) : (
            "Done"
          )}
        </button>
      )}
      <WorktreeSelector />
    </div>
  );

  return (
    <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center pb-5 pointer-events-none z-10">
      {(isPanelOpen || panelClosing) && (
        <div
          className={cn(
            "w-full max-w-3xl mx-auto pointer-events-none mb-2",
            panelClosing
              ? "animate-out fade-out slide-out-to-bottom-2 duration-150"
              : "animate-in fade-in slide-in-from-bottom-2 duration-200",
          )}
        >
          <div className="px-3 w-full">
            <div
              data-ai-bar-panel
              className="w-full pointer-events-auto rounded-lg border border-border bg-card shadow-lg overflow-hidden flex flex-col"
              style={{ height: "min(60vh, 600px)" }}
            >
              <div className="flex items-center justify-between shrink-0 px-3 py-1.5">
                <span className="text-[length:var(--font-chat-meta)] text-muted-foreground truncate">
                  {activeTabTitle}
                </span>
                <button
                  type="button"
                  className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  onClick={closePanel}
                  title="Close chat panel"
                >
                  <XIcon className="size-3.5" />
                </button>
              </div>
              <div className="flex-1 min-h-0 flex flex-col">
                <ChatMessages />
              </div>
              <RestoreUndoBar />
            </div>
          </div>
        </div>
      )}

      {/* idle ↔ input morph on one shell; expanded shares composer instance with input */}
      <div
        ref={composerShellRef}
        data-ai-bar-capsule
        className="w-full max-w-3xl mx-auto pointer-events-none"
      >
        <div className="px-3 w-full">
          {toolbar}
          <div
            ref={morphRef}
            className={cn(
              "pointer-events-auto mx-auto w-full transition-all duration-200 ease-out overflow-hidden",
              phase === "idle" &&
                "group flex items-center rounded-full border h-1.5 max-w-30 px-0 bg-muted-foreground/75 border-border/40 cursor-pointer hover:h-8 hover:max-w-[220px] hover:bg-muted hover:border-border hover:delay-0 delay-100",
              phase === "input" &&
                "flex items-center rounded-full h-12 max-w-3xl px-3 border border-border bg-card cursor-text",
              phase === "expanded" &&
                "rounded-2xl border border-border bg-card animate-in fade-in slide-in-from-bottom-1 duration-200",
            )}
            onClick={phase === "idle" ? openInput : undefined}
          >
            {phase === "idle" ? (
              <span
                className="opacity-0 group-hover:opacity-100 scale-50 group-hover:scale-100 origin-center
                  transition-all duration-200 ease-out delay-100 group-hover:delay-0
                  flex items-center justify-between select-none shrink-0 w-full px-3"
              >
                <span className="text-[length:var(--font-chat-meta)] text-muted-foreground group-hover:text-foreground transition-colors duration-200 whitespace-nowrap">
                  Manage AI Assistants
                </span>
                <Kbd className="bg-transparent transition-colors duration-200">⌘I</Kbd>
              </span>
            ) : (
              <div
                className={cn(
                  "w-full min-w-0 animate-in fade-in duration-150",
                  phase === "input" && "h-full",
                )}
              >
                <ChatComposerCore
                  variant={isExpanded ? "capsule-expanded" : "capsule-compact"}
                  capsulePlaceholder="Ask AI about your research..."
                  onLayoutExpand={openExpanded}
                  className={isInputting ? "h-full w-full" : undefined}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
