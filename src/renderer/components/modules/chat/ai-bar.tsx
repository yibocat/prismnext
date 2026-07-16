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
import { IntensiveReadingListButton } from "./intensive-reading-list-button";
import { cn } from "@/lib/utils";
import { useChatFileDrop, useOsFileDragging } from "@/lib/chat/use-chat-file-drop";
import { chatFileDropZoneClass, chatCapsuleFileDropActiveClass } from "@/lib/chat/chat-file-drag-overlay";

/** Capsule AiBar toolbar — dedicated pill radius (not Appearance). */
const CAPSULE_TOOLBAR_PILL =
  "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 text-[length:var(--font-chat-meta)] transition-colors";

/** Capsule outer shell — neutral gray border (not theme accent). */
const CAPSULE_SHELL_BORDER = "border-neutral-400/55 dark:border-neutral-600/70";
const CAPSULE_SHELL_BORDER_IDLE = "border-neutral-400/35 dark:border-neutral-600/45";

/** idle: hover pill · input: compact capsule · expanded: full composer */
type Phase = "idle" | "input" | "expanded";

/** idle / half-input share one radius so size morph doesn't fight 9999px→16px radius jumps. */
const CAPSULE_PILL_RADIUS = "rounded-[1.5rem]"; // 24px ≈ half of h-12
const CAPSULE_EXPANDED_RADIUS = "rounded-2xl"; // 16px — small delta from 24px, interpolates smoothly

const CAPSULE_MORPH_TRANSITION =
  "transition-[max-width,height,max-height,padding,border-radius,background-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]";

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
  const attachNonce = useComposerInsertStore((s) => s.attachNonce);
  const attachmentCount = useComposerInsertStore((s) => s.composerAttachmentCount);

  const draftParts = loadDraftParts(tabDraft);
  const draftEmpty = isComposerEmpty(draftParts);
  const draftEmptyRef = useRef(draftEmpty);
  draftEmptyRef.current = draftEmpty;
  const attachmentCountRef = useRef(attachmentCount);
  attachmentCountRef.current = attachmentCount;

  const hasConversation = messages.length > 0 || isStreaming;
  const isInputting = phase === "input";
  const isComposerVisible = phase !== "idle";
  const composerHasContent = !draftEmpty || attachmentCount > 0;

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

  const panelDrop = useChatFileDrop({ onQueued: openInput });
  const capsuleDrop = useChatFileDrop({ onQueued: openInput });
  const osFileDragging = useOsFileDragging();

  // Drag over capsule hit-target → expand to half-input (do not expand on any window drag)
  useEffect(() => {
    if (!capsuleDrop.dragActive) return;
    if (phase === "idle") openInput();
  }, [capsuleDrop.dragActive, phase, openInput]);

  // Restore compact capsule when draft/attachments have content (e.g. after tab switch)
  useEffect(() => {
    if (phase === "idle" && composerHasContent) {
      setPhase("input");
    }
  }, [phase, composerHasContent]);

  useEffect(() => {
    if (aiBarComposerFocusNonce === 0) return;
    const expandForInsert =
      pendingInsert?.kind === "code" ||
      pendingInsert?.kind === "git-diff" ||
      pendingInsert?.kind === "terminal";
    if (expandForInsert) openExpanded();
    else openInput();
  }, [aiBarComposerFocusNonce, openExpanded, openInput, pendingInsert?.kind]);

  // New attachment queue → ensure half-input is open (do NOT re-open on every idle)
  useEffect(() => {
    if (attachNonce === 0) return;
    openInput();
  }, [attachNonce, openInput]);

  // Expand only for explicit newlines in draft — line-full overflow handled in editor
  useEffect(() => {
    if (phase !== "input") return;
    if (composerNeedsExpandedLayout(draftParts)) {
      setPhase("expanded");
    }
  }, [draftParts, phase]);

  // Shrink back to compact capsule when expanded content is cleared.
  // Whitespace/newline-only drafts count as "empty" for send but still need expanded layout.
  useEffect(() => {
    if (
      phase === "expanded" &&
      draftEmpty &&
      attachmentCount === 0 &&
      !composerNeedsExpandedLayout(draftParts)
    ) {
      collapseToInput();
    }
  }, [phase, draftEmpty, attachmentCount, draftParts, collapseToInput]);

  // Click outside → idle when compact capsule is empty (no draft, no attachments)
  useEffect(() => {
    if (phase !== "input" || isPanelOpen) return;

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (composerShellRef.current?.contains(target)) return;
      if (target.closest("[data-radix-menu-content]") || target.closest("[data-radix-popper-content-wrapper]")) return;
      if (draftEmptyRef.current && attachmentCountRef.current === 0) collapseToIdle();
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
        "flex items-center gap-1 pointer-events-auto transition-all duration-200 ease-out",
        isComposerVisible
          ? "h-7 mb-2 opacity-100 translate-y-0"
          : "h-0 mb-0 opacity-0 -translate-y-1 overflow-hidden",
      )}
    >
      {hasConversation && (
        <button
          type="button"
          className={cn(
            CAPSULE_TOOLBAR_PILL,
            "bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground mr-1",
          )}
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
      <WorktreeSelector variant="capsule" />
      <IntensiveReadingListButton compact variant="capsule" />
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
              ref={panelDrop.zoneRef}
              data-ai-bar-panel
              className={cn(
                "relative w-full pointer-events-auto rounded-lg border border-border bg-card shadow-lg overflow-hidden flex flex-col",
                panelDrop.dragActive && chatFileDropZoneClass,
              )}
              style={{ height: "min(60vh, 600px)" }}
              {...panelDrop.dropHandlers}
            >
              {panelDrop.dragActive ? (
                <span className="pointer-events-none absolute bottom-3 left-1/2 z-30 -translate-x-1/2 rounded-md border border-primary/25 bg-background/95 px-3 py-1 text-[length:var(--font-size-11)] text-muted-foreground shadow-sm">
                  Drop files to attach
                </span>
              ) : null}
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
        className="relative w-full max-w-3xl mx-auto pointer-events-none @container"
      >
        {/* Idle pill is tiny — only while OS file-dragging, accept drops on a bottom strip (no layout change when idle). */}
        {phase === "idle" ? (
          <div
            ref={capsuleDrop.zoneRef}
            className={cn(
              "absolute inset-x-3 bottom-0 h-14 z-20 rounded-2xl",
              osFileDragging ? "pointer-events-auto" : "pointer-events-none",
              capsuleDrop.dragActive && chatCapsuleFileDropActiveClass,
            )}
            {...capsuleDrop.dropHandlers}
          />
        ) : null}
        <div className="px-3 w-full">
          {toolbar}
          <div
            ref={(node) => {
              morphRef.current = node;
              if (phase !== "idle") capsuleDrop.zoneRef(node);
            }}
            className={cn(
              "pointer-events-auto relative overflow-hidden border w-full mx-auto",
              CAPSULE_PILL_RADIUS,
              CAPSULE_MORPH_TRANSITION,
              phase === "idle" &&
                cn(
                  "group flex items-center bg-muted-foreground/75 h-1.5 max-h-1.5 max-w-30 px-0 cursor-pointer hover:h-8 hover:max-h-8 hover:max-w-[220px] hover:bg-muted hover:delay-0 delay-100",
                  CAPSULE_SHELL_BORDER_IDLE,
                  "hover:border-neutral-400/55 dark:hover:border-neutral-600/70",
                ),
              phase === "input" &&
                cn(
                  "flex items-center h-12 max-h-12 max-w-3xl px-3 bg-card cursor-text",
                  CAPSULE_SHELL_BORDER,
                ),
              phase === "expanded" &&
                cn(
                  CAPSULE_EXPANDED_RADIUS,
                  "max-h-[min(60vh,480px)] max-w-3xl bg-card",
                  CAPSULE_SHELL_BORDER,
                ),
            )}
            onClick={phase === "idle" ? openInput : undefined}
            {...(phase !== "idle" ? capsuleDrop.dropHandlers : {})}
          >
            {phase !== "idle" && capsuleDrop.dragActive ? (
              <div
                aria-hidden
                className={cn(
                  "pointer-events-none absolute inset-0 z-10",
                  phase === "expanded" ? CAPSULE_EXPANDED_RADIUS : CAPSULE_PILL_RADIUS,
                  chatCapsuleFileDropActiveClass,
                )}
              />
            ) : null}
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
              <div className={cn("w-full min-w-0", phase === "input" && "h-full")}>
                <ChatComposerCore
                  variant={phase === "expanded" ? "capsule-expanded" : "capsule-compact"}
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
