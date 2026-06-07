import { useRef, useState, useEffect, useCallback } from "react";
import { Kbd } from "@/components/ui/kbd";
import { ChatComposer } from "./chat-composer";
import { ChatMessages } from "./chat-messages";
import { useChatStore } from "@/stores/chat-store";
import {
  ArrowUpIcon,
  PlusIcon,
  FileTextIcon,
  ImageIcon,
  LinkIcon,
  Code2Icon,
  XIcon,
  Maximize2Icon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WorktreeSelector } from "./worktree-selector";
import { cn } from "@/lib/utils";

type Phase = "idle" | "input" | "expanded";

export function AiBar() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [value, setValue] = useState("");
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
  const inputRef = useRef<HTMLInputElement>(null);
  const expandedRef = useRef<HTMLDivElement>(null);
  const capsuleRef = useRef<HTMLDivElement>(null);
  const pendingTextRef = useRef("");
  const willExpandRef = useRef(false);

  // Keep latest value accessible from the document-level listener
  const valueRef = useRef(value);
  valueRef.current = value;

  const sendPrompt = useChatStore((s) => s.sendPrompt);
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const activeTabTitle = useChatStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return tab?.title ?? "Chat";
  });

  // Toolbar visible when there's a conversation (messages or streaming)
  const hasConversation = messages.length > 0 || isStreaming;

  const isInputting = phase === "input";

  const openInput = useCallback(() => {
    setPhase("input");
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const collapseToIdle = useCallback(() => {
    setPhase("idle");
    setValue("");
  }, []);

  const expandFromDropdown = useCallback(() => {
    willExpandRef.current = true;
    setPhase("expanded");
  }, []);

  // ─── Collapse on click-outside (only when input is empty, not when panel is open) ───
  useEffect(() => {
    if (!isInputting || isPanelOpen) return;

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!capsuleRef.current) return;

      // Click inside capsule → stay
      if (capsuleRef.current.contains(target)) return;

      // Click inside a Radix dropdown/portal → stay
      if (target.closest("[data-radix-menu-content]") || target.closest("[data-radix-popper-content-wrapper]")) return;

      // Click outside, input empty → collapse
      if (!valueRef.current.trim()) {
        collapseToIdle();
      }
    };

    document.addEventListener("mousedown", handleMouseDown, true);
    return () => document.removeEventListener("mousedown", handleMouseDown, true);
  }, [isInputting, isPanelOpen, collapseToIdle]);

  // ─── Close panel on click-outside ───
  useEffect(() => {
    if (!isPanelOpen) return;

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Click inside the panel → stay
      if (target.closest("[data-ai-bar-panel]")) return;

      // Click inside the capsule or expanded composer → stay (user is typing)
      if (capsuleRef.current?.contains(target)) return;
      if (expandedRef.current?.contains(target)) return;

      // Click inside a Radix dropdown/portal → stay
      if (target.closest("[data-radix-menu-content]") || target.closest("[data-radix-popper-content-wrapper]")) return;

      // Click anywhere else → close panel
      closePanel();
    };

    document.addEventListener("mousedown", handleMouseDown, true);
    return () => document.removeEventListener("mousedown", handleMouseDown, true);
  }, [isPanelOpen, closePanel]);

  // ─── After ChatComposer mounts, inject the pending text and resume typing ───
  useEffect(() => {
    if (phase !== "expanded" || !pendingTextRef.current) return;
    const container = expandedRef.current;
    if (!container) return;
    const timer = requestAnimationFrame(() => {
      const textarea = container.querySelector("textarea");
      if (!textarea) return;
      const text = pendingTextRef.current;
      pendingTextRef.current = "";
      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype, "value",
      )?.set;
      nativeSetter?.call(textarea, text);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(text.length, text.length);
      });
    });
    return () => cancelAnimationFrame(timer);
  }, [phase]);

  const expandToComposer = useCallback((text: string) => {
    if (!text.trim()) return;
    willExpandRef.current = true;
    pendingTextRef.current = text;
    setPhase("expanded");
  }, []);

  const handleSend = useCallback(() => {
    if (!value.trim() || isStreaming) return;
    sendPrompt(value);
    setValue("");
    inputRef.current?.focus();
  }, [value, isStreaming, sendPrompt]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setValue(v);
      if (e.target.scrollWidth > e.target.clientWidth && v.trim()) {
        expandToComposer(v);
      }
    },
    [expandToComposer],
  );

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center pb-5 pointer-events-none z-10">
      {/* ── Chat Panel — conversation messages only ── */}
      {(isPanelOpen || panelClosing) && (
        <div className={cn(
          "w-full max-w-3xl mx-auto pointer-events-none mb-2",
          panelClosing ? "animate-out fade-out slide-out-to-bottom-2 duration-150" : "animate-in fade-in slide-in-from-bottom-2 duration-200",
        )}>
          <div className="px-3 w-full">
          <div
            data-ai-bar-panel
            className="w-full pointer-events-auto rounded-2xl border border-border bg-background shadow-lg overflow-hidden flex flex-col"
            style={{ height: "min(60vh, 600px)" }}
          >
            {/* Panel header — session title + actions */}
            <div className="flex items-center justify-between shrink-0 px-3 py-1.5">
              <span className="text-[length:var(--font-chat-meta)] text-muted-foreground truncate">
                {activeTabTitle}
              </span>
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  title="Maximize"
                >
                  <Maximize2Icon className="size-3.5" />
                </button>
                <button
                  type="button"
                  className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  onClick={closePanel}
                  title="Close chat panel"
                >
                  <XIcon className="size-3.5" />
                </button>
              </div>
            </div>
            {/* Messages — needs flex-col parent so ChatMessages' flex-1 resolves to a height */}
            <div className="flex-1 min-h-0 flex flex-col">
              <ChatMessages />
            </div>
          </div>
          </div>
        </div>
      )}

      {/* ── idle + input: shared capsule element for smooth transitions ── */}
      {phase !== "expanded" && (
        <div
          ref={capsuleRef}
          data-ai-bar-capsule
          className="w-full max-w-3xl mx-auto pointer-events-none"
        >
        <div className="px-3 w-full">
          {/* Toolbar — hidden when chat panel is open */}
          {!isPanelOpen && (
            <div
              className={cn(
                "flex items-center pointer-events-auto transition-all duration-200 ease-out",
                isInputting
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
          )}
          {/* Capsule — same DOM element, classes transition smoothly */}
          <div
            className={cn(
              "flex items-center gap-2 rounded-full pointer-events-auto border mx-auto",
              "transition-all duration-200 ease-out",
              "w-full",
              isInputting
                ? "h-12 max-w-3xl px-3 bg-card border-border cursor-text"
                : "group h-1.5 max-w-30 px-0 bg-muted-foreground/75 border-border/40 cursor-pointer hover:h-8 hover:max-w-[220px] hover:bg-muted hover:border-border hover:delay-0 delay-100",
            )}
            onClick={() => { if (!isInputting) openInput(); }}
          >
            {/* Idle label — sync delay with capsule */}
            {!isInputting && (
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
            )}
            {/* Input content */}
            {isInputting && (
              <>
                <DropdownMenu
                  onOpenChange={(open) => {
                    if (!open) {
                      setTimeout(() => inputRef.current?.focus(), 0);
                    }
                  }}
                >
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex size-7 items-center justify-center rounded-full bg-muted-foreground/20 text-muted-foreground transition-colors hover:bg-muted-foreground/30 hover:text-foreground shrink-0"
                      title="Add context"
                    >
                      <PlusIcon className="size-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48">
                    <DropdownMenuItem
                      className="text-[length:var(--font-chat-meta)]"
                      onClick={expandFromDropdown}
                    >
                      <FileTextIcon className="size-3.5" />
                      <span>Select file</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-[length:var(--font-chat-meta)]"
                      onClick={expandFromDropdown}
                    >
                      <ImageIcon className="size-3.5" />
                      <span>Upload image</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-[length:var(--font-chat-meta)]" disabled>
                      <LinkIcon className="size-3.5" />
                      <span>Add link</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-[length:var(--font-chat-meta)]" disabled>
                      <Code2Icon className="size-3.5" />
                      <span>Add code snippet</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <input
                  ref={inputRef}
                  className="flex-1 bg-transparent text-[length:var(--font-size-14)] outline-none placeholder:text-muted-foreground"
                  placeholder="Ask AI about your research..."
                  value={value}
                  onChange={handleInputChange}
                  onKeyDown={handleInputKeyDown}
                />
                <button
                  type="button"
                  className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shrink-0"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleSend}
                  title="Send"
                >
                  <ArrowUpIcon className="size-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
        </div>
      )}

      {/* ── expanded — toolbar + ChatComposer */}
      {phase === "expanded" && (
        <div
          ref={expandedRef}
          className="pointer-events-auto w-full max-w-3xl mx-auto"
          onInput={(e) => {
            const t = e.target;
            if (t instanceof HTMLTextAreaElement && t.value === "") {
              willExpandRef.current = false;
              setPhase("input");
              setValue("");
              requestAnimationFrame(() => inputRef.current?.focus());
            }
          }}
        >
          {/* Toolbar — hidden when chat panel is open */}
          {!isPanelOpen && (
            <div className="flex items-center h-7 mb-2 pl-3">
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
          )}
          <ChatComposer />
        </div>
      )}
    </div>
  );
}
