import { useRef, useCallback, useEffect, useState, useMemo } from "react";
import {
  AuiIf,
  ComposerPrimitive,
  ThreadPrimitive,
} from "@assistant-ui/react";
import { useClaudeChatStore } from "@/stores/claude-chat-store";
import { ClaudeRuntimeProvider } from "./runtime-provider";
import { AssistantMessage } from "./assistant-message";
import { UserMessage } from "./user-message";
import { ChatTabBar } from "./chat-tab-bar";
import { SessionSelector } from "./session-selector";
import {
  ChevronDownIcon,
  MessageCircleIcon,
  Maximize2Icon,
  Minimize2Icon,
  ArrowUpIcon,
  SquareIcon,
  ArrowDownIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const DEFAULT_HEIGHT = 360;
const MIN_HEIGHT = 150;

export function ClaudeChatDrawer() {
  const drawerState = useClaudeChatStore((s) => s.drawerState);
  const setDrawerState = useClaudeChatStore((s) => s.setDrawerState);
  const anyStreaming = useClaudeChatStore((s) => s.tabs.some((t) => t.isStreaming));
  const error = useClaudeChatStore((s) => s.error);

  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const heightRef = useRef(height);
  heightRef.current = height;
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const hasDraggedRef = useRef(false);
  const rafRef = useRef<number>(0);

  const isOpen = drawerState !== "closed";
  const isExpanded = drawerState === "expanded";

  // Auto-open when streaming starts on any tab
  useEffect(() => {
    if (anyStreaming && !isOpen) {
      setDrawerState("open");
      const parent = containerRef.current?.parentElement;
      const maxHeight = parent ? parent.clientHeight - 40 : 400;
      setHeight(maxHeight);
      heightRef.current = maxHeight;
      if (panelRef.current) {
        panelRef.current.style.height = `${maxHeight}px`;
      }
    }
  }, [anyStreaming, isOpen, setDrawerState]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isExpanded) return;
      e.preventDefault();
      setIsDragging(true);
      hasDraggedRef.current = false;

      const startY = e.clientY;
      const startHeight = heightRef.current;

      const handleMouseMove = (e: MouseEvent) => {
        hasDraggedRef.current = true;
        const parent = containerRef.current?.parentElement;
        const maxHeight = parent ? parent.clientHeight - 40 : 400;
        const delta = startY - e.clientY;
        const newHeight = Math.min(Math.max(startHeight + delta, MIN_HEIGHT), maxHeight);
        heightRef.current = newHeight;

        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          if (panelRef.current) {
            panelRef.current.style.height = `${newHeight}px`;
          }
        });
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        setHeight(heightRef.current);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [isExpanded],
  );

  // Memoize panel style
  const panelStyle = useMemo((): React.CSSProperties => {
    const base: React.CSSProperties = {
      willChange: isDragging ? "height" : "transform, opacity",
    };
    if (!isOpen && !isExpanded) {
      return { ...base, height: 0, maxWidth: 672, borderRadius: 24 };
    }
    if (isExpanded) {
      return { ...base, height: "100%", maxWidth: "100%", borderRadius: 0 };
    }
    return { ...base, height, maxWidth: 672, borderRadius: 24 };
  }, [isOpen, isExpanded, height, isDragging]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "pointer-events-none absolute inset-0 z-10 flex items-end justify-center transition-[padding] duration-300 ease-out",
        isExpanded ? "p-0" : "px-4 pt-4 pb-6",
      )}
    >
      {/* FAB button */}
      <button
        type="button"
        onClick={() => setDrawerState("open")}
        className={cn(
          "pointer-events-auto absolute right-4 bottom-6 flex size-12 items-center justify-center rounded-full border border-border bg-background shadow-lg transition-all duration-300 ease-out hover:scale-105 hover:shadow-xl",
          isOpen ? "pointer-events-none scale-50 opacity-0" : "scale-100 opacity-100",
        )}
        aria-label="Open AI Assistant"
      >
        <MessageCircleIcon className="size-5 text-foreground" />
      </button>

      {/* Chat panel */}
      <div
        ref={panelRef}
        className={cn(
          "pointer-events-auto flex w-full flex-col overflow-hidden border bg-background",
          "transition-[max-width,border-radius,border-color,box-shadow,opacity,transform] duration-300 ease-out",
          isExpanded ? "border-transparent shadow-none" : "border-border shadow-2xl",
          isOpen
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-4 opacity-0",
          isDragging && "!transition-none",
        )}
        style={panelStyle}
      >
        {/* Header */}
        {isExpanded ? (
          <div className="flex items-center justify-between border-border border-b px-2 py-1">
            <button
              type="button"
              onClick={() => setDrawerState("open")}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Exit fullscreen"
            >
              <Minimize2Icon className="size-4" />
            </button>
            <SessionSelector />
          </div>
        ) : (
          <div className="relative">
            <div
              className="group flex cursor-row-resize items-center justify-center gap-2 py-2 transition-colors hover:bg-muted/50"
              onMouseDown={handleMouseDown}
              onClick={() => {
                if (!hasDraggedRef.current) {
                  setDrawerState("closed");
                }
              }}
            >
              <div className="h-1 w-10 rounded-full bg-muted-foreground/30 transition-all group-hover:w-8" />
              <ChevronDownIcon className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
            <div className="absolute top-1/2 left-2 flex -translate-y-1/2 items-center gap-1">
              <button
                type="button"
                onClick={() => setDrawerState("expanded")}
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Fullscreen"
              >
                <Maximize2Icon className="size-4" />
              </button>
            </div>
            <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
              <SessionSelector />
            </div>
          </div>
        )}

        {/* Tab bar */}
        <ChatTabBar />

        {/* Error banner */}
        {error && (
          <div className="mx-3 mb-1 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-1.5 text-destructive text-[length:var(--font-chat-meta)]">
            {error}
          </div>
        )}

        {/* Thread + Composer (wrapped in RuntimeProvider) */}
        <ClaudeRuntimeProvider>
          <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
            <ThreadPrimitive.Viewport
              turnAnchor="top"
              className="flex flex-1 flex-col overflow-y-auto scroll-smooth"
            >
              <AuiIf condition={(s) => s.thread.isEmpty}>
                <div className="flex flex-1 items-center justify-center p-8">
                  <div className="flex flex-col items-center gap-4 text-center max-w-sm">
                    <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
                      <MessageCircleIcon className="size-7 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="text-[length:var(--font-composer)] font-medium text-foreground">Start a conversation</h3>
                      <p className="mt-1 text-[length:var(--font-chat-meta)] text-muted-foreground leading-relaxed">
                        Ask your AI assistant to help with your LaTeX document.
                        Try things like "Add a theorem environment" or "Fix the citations in section 3".
                      </p>
                    </div>
                  </div>
                </div>
              </AuiIf>

              <ThreadPrimitive.Messages>
                {({ message }) => {
                  if (message.role === "user") return <UserMessage />;
                  return <AssistantMessage />;
                }}
              </ThreadPrimitive.Messages>

              <ThreadPrimitive.ViewportFooter className="sticky bottom-0 pt-2">
                <div className="max-w-3xl mx-auto w-full px-3 pb-3">
                  <ComposerPrimitive.Root className="flex w-full flex-col rounded-2xl border border-input bg-muted/30 transition-colors focus-within:border-ring focus-within:bg-background">
                    <ComposerPrimitive.Input
                      placeholder="Ask me anything..."
                      className="max-h-40 min-h-10 w-full resize-none bg-transparent px-4 py-2 text-[length:var(--font-composer)] outline-none placeholder:text-muted-foreground"
                      rows={1}
                    />
                    <div className="flex items-center justify-end px-2 pb-2 gap-1.5">
                      <AuiIf condition={(s) => !s.thread.isRunning}>
                        <ComposerPrimitive.Send
                          className="flex size-8 items-center justify-center rounded-full bg-foreground text-background hover:bg-foreground/90 disabled:opacity-30"
                          disabled={false}
                        >
                          <ArrowUpIcon className="size-4" />
                        </ComposerPrimitive.Send>
                      </AuiIf>
                      <AuiIf condition={(s) => s.thread.isRunning}>
                        <ComposerPrimitive.Cancel className="flex size-8 items-center justify-center rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          <SquareIcon className="size-3 fill-current" />
                        </ComposerPrimitive.Cancel>
                      </AuiIf>
                    </div>
                  </ComposerPrimitive.Root>
                </div>
              </ThreadPrimitive.ViewportFooter>
            </ThreadPrimitive.Viewport>

            <ThreadPrimitive.ScrollToBottom className="absolute bottom-24 right-6 flex size-8 items-center justify-center rounded-full border border-border bg-background shadow-md text-muted-foreground hover:text-foreground transition-all hover:shadow-lg z-10">
              <ArrowDownIcon className="size-4" />
            </ThreadPrimitive.ScrollToBottom>
          </ThreadPrimitive.Root>
        </ClaudeRuntimeProvider>
      </div>
    </div>
  );
}
