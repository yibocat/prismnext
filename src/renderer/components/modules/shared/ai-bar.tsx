import { useRef, useState, useEffect, useCallback } from "react";
import { Kbd } from "@/components/ui/kbd";
import { ChatComposer } from "@/components/modules/chat/chat-composer";
import { ArrowUpIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Phase = "idle" | "input" | "expanded";

export function AiBar() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const expandedRef = useRef<HTMLDivElement>(null);
  const pendingTextRef = useRef("");
  const willExpandRef = useRef(false);

  const isInputting = phase === "input";

  const openInput = useCallback(() => {
    setPhase("input");
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // After ChatComposer mounts, inject the pending text and resume typing
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
        if (value.trim()) expandToComposer(value);
      }
    },
    [value, expandToComposer],
  );

  const collapseToIdle = useCallback(() => {
    setPhase("idle");
  }, []);

  return (
    <div className="absolute bottom-0 left-0 right-0 flex justify-center pb-5 px-3 pointer-events-none z-10">
      {/* ── idle + input: shared container with size transition ── */}
      {phase !== "expanded" && (
        <div
          className={cn(
            "flex items-center rounded-full pointer-events-auto overflow-hidden border",
            "transition-all duration-200 ease-out",
            isInputting
              ? "h-10 w-[672px] max-w-full px-4 bg-card border-border cursor-text"
              : "group h-1.5 w-30 px-0 bg-muted-foreground/75 border-border/40 cursor-pointer hover:h-8 hover:w-[220px] hover:bg-muted/80 hover:border-border/100",
          )}
          onClick={() => { if (!isInputting) openInput(); }}
        >
          {/* Idle label — fades out when inputting */}
          {!isInputting && (
            <span
              className="opacity-0 group-hover:opacity-100 scale-50 group-hover:scale-100 origin-center
                transition-all duration-200 ease-out
                flex items-center justify-between select-none shrink-0 w-full px-3"
            >
              <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors duration-200 whitespace-nowrap">
                Manage AI Assistants
              </span>
              <Kbd className="bg-transparent transition-all duration-200">⌘I</Kbd>
            </span>
          )}

          {/* Input field — visible when inputting */}
          {isInputting && (
            <>
              <input
                ref={inputRef}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder="Ask AI about your research..."
                value={value}
                onChange={handleInputChange}
                onKeyDown={handleInputKeyDown}
                onBlur={() => {
                  if (willExpandRef.current) {
                    willExpandRef.current = false;
                    return;
                  }
                  if (!value.trim()) collapseToIdle();
                }}
              />
              <button
                type="button"
                className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shrink-0 ml-2"
                onMouseDown={(e) => e.preventDefault()}
                title="Send"
              >
                <ArrowUpIcon className="size-3.5" />
              </button>
            </>
          )}
        </div>
      )}

      {/* ── expanded ── */}
      {phase === "expanded" && (
        <div
          ref={expandedRef}
          className="pointer-events-auto w-[672px] max-w-full"
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
          <ChatComposer />
        </div>
      )}
    </div>
  );
}
