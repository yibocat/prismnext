import { useRef, useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ChatComposerCore } from "./chat-composer-core";
import { ChatMessages } from "./chat-messages";
import { ComposerChromeStack } from "./composer-chrome-stack";
import { SubAgentRunPanel, SUBAGENT_PANEL_EXIT_MS } from "./subagent-run-panel";
import { ChatFloatPanel, CHAT_FLOAT_PANEL_HEIGHT } from "./chat-float-panel";
import { RestoreUndoBar } from "./restore-undo-bar";
import { useChatStore } from "@/stores/chat-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useComposerInsertStore } from "@/stores/composer-insert-store";
import { useComposerEditorStore } from "@/stores/composer-editor-store";
import { WorktreeSelector } from "./worktree-selector";
import { IntensiveReadingListButton } from "./intensive-reading-list-button";
import { blurKeyboardFocus, cn } from "@/lib/utils";
import { useChatFileDrop, useChatDropDragging } from "@/lib/chat/use-chat-file-drop";
import { chatFileDropZoneClass, chatCapsuleFileDropActiveClass } from "@/lib/chat/chat-file-drag-overlay";
import { displayChatTitle } from "@/lib/i18n/display-chat-title";
import { ShortcutKbdChips } from "@/lib/shortcuts";
import {
  chordMatchesEvent,
  detectShortcutPlatform,
  resolveChord,
} from "../../../../shared/shortcuts";
import { useSettingsStore } from "@/stores/settings-store";

/** Capsule AiBar toolbar — dedicated pill radius (not Appearance). */
const CAPSULE_TOOLBAR_PILL =
  "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 text-[length:var(--font-chat-meta)] transition-colors";

/** Capsule outer shell — neutral gray border (not theme accent). */
const CAPSULE_SHELL_BORDER = "border-border";
const CAPSULE_SHELL_BORDER_IDLE = "border-border-subtle";

/** idle: hover pill · input: compact capsule · expanded: full composer */
type Phase = "idle" | "input" | "expanded";

/** idle / half-input share one radius so size morph doesn't fight 9999px→16px radius jumps. */
const CAPSULE_PILL_RADIUS = "rounded-[1.5rem]"; // 24px — half of the default --chat-input-h (~47px)
const CAPSULE_EXPANDED_RADIUS = "rounded-2xl"; // 16px — small delta from 24px, interpolates smoothly

const CAPSULE_MORPH_TRANSITION =
  "transition-[max-width,height,max-height,padding,border-radius,background-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]";

export function AiBar() {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>("idle");
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [panelClosing, setPanelClosing] = useState(false);
  const panelClosingRef = useRef(false);
  panelClosingRef.current = panelClosing;

  const openPanel = useCallback(() => setIsPanelOpen(true), []);
  const closePanel = useCallback(() => {
    if (panelClosingRef.current) return;
    setPanelClosing(true);
    window.setTimeout(() => {
      setIsPanelOpen(false);
      setPanelClosing(false);
    }, SUBAGENT_PANEL_EXIT_MS);
  }, []);

  const composerShellRef = useRef<HTMLDivElement>(null);
  const morphRef = useRef<HTMLDivElement>(null);

  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const openSubAgentId = useChatStore(
    (s) => s.tabs.find((t) => t.id === s.activeTabId)?.openSubAgentPanelToolUseId ?? null,
  );
  const closeSubAgentPanel = useChatStore((s) => s.closeSubAgentPanel);
  const [displayedSubId, setDisplayedSubId] = useState<string | null>(null);
  const [subClosing, setSubClosing] = useState(false);
  const subClosingRef = useRef(false);
  subClosingRef.current = subClosing;

  // Only sync when store id changes — never clear `subClosing` just because it
  // became true (that cancelled the exit animation and caused close jitter).
  useEffect(() => {
    if (openSubAgentId) {
      setDisplayedSubId(openSubAgentId);
      setSubClosing(false);
      return;
    }
    if (!subClosingRef.current) setDisplayedSubId(null);
  }, [openSubAgentId]);

  const closeSubAnimated = useCallback(() => {
    if (subClosingRef.current || !displayedSubId) return;
    setSubClosing(true);
    // Clear store id immediately (panel-chat scrim fades with exit); keep
    // `displayedSubId` mounted until the animation finishes.
    closeSubAgentPanel();
    blurKeyboardFocus();
    window.setTimeout(() => {
      setDisplayedSubId(null);
      setSubClosing(false);
    }, SUBAGENT_PANEL_EXIT_MS);
  }, [closeSubAgentPanel, displayedSubId]);

  const draftEmpty = useComposerEditorStore((s) => s.draftEmpty);
  const draftNeedsExpanded = useComposerEditorStore((s) => s.draftNeedsExpanded);
  const activeTabTitleRaw = useChatStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return tab?.title ?? "Chat";
  });
  const activeTabTitle = displayChatTitle(activeTabTitleRaw, t);
  const subPanelOpen = !!displayedSubId;
  /** Sub still covering the stack (excludes exit frames so main can un-peek smoothly). */
  const subPanelFront = subPanelOpen && !subClosing;
  const mainPanelVisible = isPanelOpen || panelClosing;
  const stackVisible = mainPanelVisible || subPanelOpen;
  /** Whole stack exits when the last visible panel is closing. */
  const stackExiting =
    (panelClosing && !subPanelOpen)
    || (subClosing && !mainPanelVisible);

  const aiBarComposerFocusNonce = useLayoutStore((s) => s.aiBarComposerFocusNonce);
  const pendingInserts = useComposerInsertStore((s) => s.pendingInserts);
  const attachNonce = useComposerInsertStore((s) => s.attachNonce);
  const attachmentCount = useComposerInsertStore((s) => s.composerAttachmentCount);

  const draftEmptyRef = useRef(draftEmpty);
  draftEmptyRef.current = draftEmpty;
  const attachmentCountRef = useRef(attachmentCount);
  attachmentCountRef.current = attachmentCount;

  const queueLength = useChatStore(
    (s) => s.tabs.find((t) => t.id === s.activeTabId)?.composerSendQueue.length ?? 0,
  );
  const queueLengthRef = useRef(queueLength);
  queueLengthRef.current = queueLength;

  const hasConversation = messages.length > 0 || isStreaming;
  const isInputting = phase === "input";
  const isComposerVisible = phase !== "idle";
  const composerHasContent = !draftEmpty || attachmentCount > 0 || queueLength > 0;

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
  const chatDropDragging = useChatDropDragging();

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
    const last = pendingInserts[pendingInserts.length - 1];
    const expandForInsert =
      last?.kind === "code" ||
      last?.kind === "git-diff" ||
      last?.kind === "terminal";
    if (expandForInsert) openExpanded();
    else openInput();
  }, [aiBarComposerFocusNonce, openExpanded, openInput, pendingInserts]);

  // New attachment queue → ensure half-input is open (do NOT re-open on every idle)
  useEffect(() => {
    if (attachNonce === 0) return;
    openInput();
  }, [attachNonce, openInput]);

  // Expand only for explicit newlines in draft — line-full overflow handled in editor
  useEffect(() => {
    if (phase !== "input") return;
    if (draftNeedsExpanded) {
      setPhase("expanded");
    }
  }, [draftNeedsExpanded, phase]);

  // Shrink back to compact capsule when expanded content is cleared.
  // Whitespace/newline-only drafts count as "empty" for send but still need expanded layout.
  useEffect(() => {
    if (
      phase === "expanded" &&
      draftEmpty &&
      attachmentCount === 0 &&
      !draftNeedsExpanded
    ) {
      collapseToInput();
    }
  }, [phase, draftEmpty, attachmentCount, draftNeedsExpanded, collapseToInput]);

  // Opening a Task panel in AiBar also peels open the main run panel behind it.
  useEffect(() => {
    if (!openSubAgentId || !hasConversation || isPanelOpen) return;
    openPanel();
  }, [openSubAgentId, hasConversation, isPanelOpen, openPanel]);

  // Click outside → idle when compact capsule is empty (no draft, no attachments)
  useEffect(() => {
    if (phase !== "input" || stackVisible) return;

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (composerShellRef.current?.contains(target)) return;
      if (target.closest("[data-radix-menu-content]") || target.closest("[data-radix-popper-content-wrapper]")) return;
      if (draftEmptyRef.current && attachmentCountRef.current === 0 && queueLengthRef.current === 0) collapseToIdle();
    };

    document.addEventListener("mousedown", handleMouseDown, true);
    return () => document.removeEventListener("mousedown", handleMouseDown, true);
  }, [phase, stackVisible, collapseToIdle]);

  useEffect(() => {
    if (!stackVisible || stackExiting) return;

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Only the float panel bodies count as "inside". Composer / workspace /
      // toolbar are outside and should dismiss (sub first, then main).
      if (target.closest("[data-subagent-run-panel]") || target.closest("[data-ai-bar-panel]")) {
        return;
      }
      if (
        target.closest("[data-radix-menu-content]")
        || target.closest("[data-radix-popper-content-wrapper]")
      ) {
        return;
      }
      if (subPanelFront) {
        closeSubAnimated();
        return;
      }
      if (subPanelOpen) return; // already exiting
      closePanel();
    };

    document.addEventListener("mousedown", handleMouseDown, true);
    return () => document.removeEventListener("mousedown", handleMouseDown, true);
  }, [stackVisible, stackExiting, subPanelOpen, subPanelFront, closeSubAnimated, closePanel]);

  // ⌘I → open/focus capsule. AiBar only mounts when editor is maximized;
  // in that mode this chord prefers the capsule over editor.italic.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && !e.metaKey && !e.ctrlKey) return;
      const overrides = useSettingsStore.getState().settings.shortcutOverrides;
      const resolved = resolveChord("product.focusAiBar", overrides);
      if (!resolved) return;
      if (!chordMatchesEvent(resolved.chord, e, detectShortcutPlatform())) return;
      e.preventDefault();
      e.stopPropagation();
      useLayoutStore.getState().requestAiBarComposerFocus();
    };
    // Capture so we win over CodeMirror italic while maximized.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  // Esc → close subagent panel, then main panel, then collapse capsule.
  useEffect(() => {
    if (phase === "idle" && !stackVisible) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const target = e.target as HTMLElement | null;
      if (
        target?.closest("[data-radix-menu-content]")
        || target?.closest("[data-radix-popper-content-wrapper]")
      ) {
        return;
      }

      if (subPanelFront) {
        e.preventDefault();
        e.stopPropagation();
        closeSubAnimated();
        return;
      }
      if (subPanelOpen) {
        e.preventDefault();
        e.stopPropagation();
        return; // already exiting
      }

      if (isPanelOpen && !panelClosing) {
        e.preventDefault();
        closePanel();
        return;
      }

      if (phase === "expanded") {
        e.preventDefault();
        if (draftEmptyRef.current && attachmentCountRef.current === 0 && queueLengthRef.current === 0) collapseToIdle();
        else collapseToInput();
        return;
      }

      if (phase === "input") {
        e.preventDefault();
        if (draftEmptyRef.current && attachmentCountRef.current === 0 && queueLengthRef.current === 0) {
          collapseToIdle();
        } else {
          (document.activeElement as HTMLElement | null)?.blur?.();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    phase,
    stackVisible,
    subPanelOpen,
    subPanelFront,
    isPanelOpen,
    panelClosing,
    closeSubAnimated,
    closePanel,
    collapseToIdle,
    collapseToInput,
  ]);

  const toolbar = !stackVisible && (
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
              {t("chat.aibar.running")}
            </>
          ) : (
            t("chat.aibar.done")
          )}
        </button>
      )}
      <WorktreeSelector variant="capsule" />
      <IntensiveReadingListButton compact variant="capsule" />
    </div>
  );

  return (
    <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center pb-5 pointer-events-none z-10">
      {stackVisible && (
        <div
          data-chat-width
          className={cn(
            "w-full pointer-events-none mb-2",
            // Transitions hold the end state (no snap when animate-out fill ends).
            "transition-[opacity,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
            stackExiting
              ? "opacity-0 translate-y-2"
              : "opacity-100 translate-y-0 animate-in fade-in slide-in-from-bottom-2 duration-200",
          )}
        >
          <div className="px-3 w-full">
            <div
              className="relative w-full pointer-events-auto"
              style={{ height: CHAT_FLOAT_PANEL_HEIGHT }}
            >
              {/* Main agent run panel — peeks behind when a subagent panel is open. */}
              {mainPanelVisible ? (
                <ChatFloatPanel
                  ref={panelDrop.zoneRef}
                  panelAttr="data-ai-bar-panel"
                  title={activeTabTitle}
                  fillHeight
                  onClose={subPanelFront ? undefined : closePanel}
                  closeLabel={t("chat.aibar.closePanel")}
                  footer={<RestoreUndoBar />}
                  className={cn(
                    panelDrop.dragActive && chatFileDropZoneClass,
                    "transition-[opacity,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
                    // Stay absolutely layered while the sub is still mounted so
                    // un-peeking doesn't switch to relative and double the stack height.
                    subPanelOpen
                      ? cn(
                          "absolute inset-0 z-0 origin-bottom pointer-events-none",
                          subPanelFront
                            ? "translate-y-[-10px] scale-[0.985] opacity-80"
                            : "translate-y-0 scale-100 opacity-100",
                        )
                      : "relative z-10",
                  )}
                  {...panelDrop.dropHandlers}
                >
                  {panelDrop.dragActive ? (
                    <span className="pointer-events-none absolute bottom-3 left-1/2 z-30 -translate-x-1/2 rounded-md border border-border bg-card px-3 py-1 text-[length:var(--font-size-11)] text-muted-foreground shadow-sm">
                      {chatDropDragging.composerActive
                        ? t("chat.aibar.dropToChat")
                        : t("chat.aibar.dropFiles")}
                    </span>
                  ) : null}
                  <ChatMessages />
                </ChatFloatPanel>
              ) : null}

              {/* Subagent run panel — same shell, front of the stack. */}
              {subPanelOpen && displayedSubId ? (
                <div
                  className={cn(
                    "relative z-10 h-full",
                    "transition-[opacity,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
                    // When the whole stack is exiting, only the outer shell moves.
                    stackExiting
                      ? "opacity-100 translate-y-0"
                      : subClosing
                        ? "opacity-0 translate-y-2"
                        : "opacity-100 translate-y-0 animate-in fade-in slide-in-from-bottom-2 duration-200",
                  )}
                >
                  <SubAgentRunPanel
                    taskToolUseId={displayedSubId}
                    fillHeight
                    onClose={closeSubAnimated}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* idle ↔ input morph on one shell; expanded shares composer instance with input */}
      <div
        ref={composerShellRef}
        data-ai-bar-capsule
        data-chat-width
        className="relative w-full pointer-events-none @container"
      >
        {/* Idle pill is tiny — while dragging files or chips, accept drops on a bottom strip. */}
        {phase === "idle" ? (
          <div
            ref={capsuleDrop.zoneRef}
            className={cn(
              "absolute inset-x-3 bottom-0 h-14 z-20 rounded-2xl",
              chatDropDragging.active ? "pointer-events-auto" : "pointer-events-none",
              capsuleDrop.dragActive && chatCapsuleFileDropActiveClass,
            )}
            {...capsuleDrop.dropHandlers}
          />
        ) : null}
        <div className="px-3 w-full">
          {toolbar}
          {/* Outside morph shell: compact capsule height is font-driven (h-[var(--chat-input-h)]); idle still needs Approve when draft is ready. */}
          <div data-chat-width className="pointer-events-auto w-full">
            <ComposerChromeStack />
          </div>
          {/* Queue sits above the capsule shell (not inside the pill), like Cursor. */}
          <div
            id="ai-bar-composer-queue-slot"
            data-chat-width
            className="pointer-events-auto w-full max-w-[var(--chat-max-w)] mx-auto"
          />
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
                  "hover:border-border",
                ),
              phase === "input" &&
                cn(
                  "flex items-center h-[var(--chat-input-h)] max-h-[var(--chat-input-h)] max-w-[var(--chat-max-w)] w-full px-3 bg-card cursor-text",
                  CAPSULE_SHELL_BORDER,
                ),
              phase === "expanded" &&
                cn(
                  CAPSULE_EXPANDED_RADIUS,
                  "max-h-[min(60vh,480px)] max-w-[var(--chat-max-w)] bg-card",
                  CAPSULE_SHELL_BORDER,
                ),
              // idle pill keeps max-w-30 (trigger chip, not the chat column).
              // input + expanded use an explicit max-w-[var(--chat-max-w)] so the
              // morph animation can interpolate max-width from the idle 7.5rem up
              // to the active tier — CSS cannot transition max-width to `none`.
              // input height also tracks --chat-input-h (font-size driven) so the
              // morph's height animation ends at the right size for the chosen
              // font.
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
            {phase !== "idle" && capsuleDrop.dragActive ? (
              <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 rounded-md border border-border bg-card px-3 py-1 text-[length:var(--font-size-11)] text-muted-foreground shadow-sm">
                {chatDropDragging.composerActive
                  ? t("chat.aibar.dropToChat")
                  : t("chat.aibar.dropFiles")}
              </span>
            ) : null}
            {phase === "idle" ? (
              <span
                className="opacity-0 group-hover:opacity-100 scale-50 group-hover:scale-100 origin-center
                  transition-all duration-200 ease-out delay-100 group-hover:delay-0
                  flex items-center justify-between select-none shrink-0 w-full px-3"
              >
                <span className="text-[length:var(--font-chat-meta)] text-muted-foreground group-hover:text-foreground transition-colors duration-200 whitespace-nowrap">
                  {t("chat.aibar.manageAssistants")}
                </span>
                <ShortcutKbdChips
                  id="product.focusAiBar"
                  kbdClassName="bg-transparent transition-colors duration-200"
                />
              </span>
            ) : (
              <div className={cn("w-full min-w-0", phase === "input" && "h-full")}>
                <ChatComposerCore
                  variant={phase === "expanded" ? "capsule-expanded" : "capsule-compact"}
                  capsulePlaceholder={t("chat.aibar.placeholder")}
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
