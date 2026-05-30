import { useRef, useState, useEffect, useCallback } from "react";
import { Kbd } from "@/components/ui/kbd";
import { ChatComposer } from "@/components/modules/chat/chat-composer";
import { useChatStore } from "@/stores/chat-store";
import {
  ArrowUpIcon,
  GitBranchIcon,
  PlusIcon,
  FileTextIcon,
  ImageIcon,
  LinkIcon,
  Code2Icon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type Phase = "idle" | "input" | "expanded";

export function AiBar() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const expandedRef = useRef<HTMLDivElement>(null);
  const capsuleRef = useRef<HTMLDivElement>(null);
  const pendingTextRef = useRef("");
  const willExpandRef = useRef(false);

  // Keep latest value accessible from the document-level listener
  const valueRef = useRef(value);
  valueRef.current = value;

  const sendPrompt = useChatStore((s) => s.sendPrompt);
  const isStreaming = useChatStore((s) => s.isStreaming);

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

  // ─── Collapse on click-outside (only when input is empty) ───
  useEffect(() => {
    if (!isInputting) return;

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
  }, [isInputting, collapseToIdle]);

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
    <div className="absolute bottom-0 left-0 right-0 flex justify-center pb-5 pointer-events-none z-10">
      {/* ── idle + input: shared capsule element for smooth transitions ── */}
      {phase !== "expanded" && (
        <div className="px-3 w-full flex justify-center pointer-events-none">
        <div
          ref={capsuleRef}
          data-ai-bar-capsule
          className="w-full max-w-3xl mx-auto pointer-events-none"
        >
          {/* Toolbar — slides in/out with capsule transition */}
          <div
            className={cn(
              "flex items-center pointer-events-auto transition-all duration-200 ease-out",
              isInputting
                ? "h-7 mb-1 opacity-100 translate-y-0"
                : "h-0 mb-0 opacity-0 -translate-y-1 overflow-hidden",
            )}
          >
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[length:var(--font-chat-meta)] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              onMouseDown={(e) => e.preventDefault()}
            >
              {isStreaming ? "Running" : "Ready"}
            </button>
            {/* TODO: Worktree selector — populate with actual git worktrees */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[length:var(--font-chat-meta)] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors ml-1"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <GitBranchIcon className="size-3.5" />
                  <span>Worktree</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {/* TODO: List actual git worktrees from the project */}
                <div className="px-2 py-1.5 text-[length:var(--font-chat-meta)] text-muted-foreground">
                  No worktrees available
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {/* Capsule — same DOM element, classes transition smoothly */}
          <div
            className={cn(
              "flex items-center gap-2 rounded-full pointer-events-auto border mx-auto",
              "transition-all duration-200 ease-out",
              "w-full",
              isInputting
                ? "h-10 max-w-3xl px-3 bg-card border-border cursor-text"
                : "group h-1.5 max-w-30 px-0 bg-muted-foreground/75 border-border/40 cursor-pointer hover:h-8 hover:max-w-[220px] hover:bg-muted/80 hover:border-border/100 hover:delay-0 delay-100",
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
                <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors duration-200 whitespace-nowrap">
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
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
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
          <div className="flex items-center h-7 mb-1 pl-3">
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[length:var(--font-chat-meta)] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              onMouseDown={(e) => e.preventDefault()}
            >
              {isStreaming ? "Running" : "Ready"}
            </button>
            {/* TODO: Worktree selector — populate with actual git worktrees */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[length:var(--font-chat-meta)] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors ml-1"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <GitBranchIcon className="size-3.5" />
                  <span>Worktree</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <div className="px-2 py-1.5 text-[length:var(--font-chat-meta)] text-muted-foreground">
                  No worktrees available
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <ChatComposer />
        </div>
      )}
    </div>
  );
}
