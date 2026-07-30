import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useChatStore } from "@/stores/chat-store";
import { BrainIcon, ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  captureViewportAnchor,
  restoreViewportAnchor,
  type ViewportAnchorCapture,
} from "@/lib/chat/preserve-viewport-anchor";
import { TOOL_EXPANDED_CONTENT_CLASS } from "./shared";
import { MarkdownRenderer } from "../markdown-renderer";

// ─── LocalStorage persistence ───

function getThinkingState(key: string): boolean {
  return localStorage.getItem(`thinking:${key}`) === "open";
}

function saveThinkingState(key: string, open: boolean): void {
  if (open) {
    localStorage.setItem(`thinking:${key}`, "open");
  } else {
    localStorage.removeItem(`thinking:${key}`);
  }
}

// ─── Thinking Widget ───

/** Tighter than assistant prose — thought is secondary chrome. */
const THINKING_MARKDOWN_TYPOGRAPHY = cn(
  "[&>div]:leading-normal",
  "[&_p]:my-0.5 [&_p]:leading-normal",
  "[&_ul]:my-0.5 [&_ol]:my-0.5",
  "[&_li]:my-0 [&_li]:leading-normal",
);

function ThinkingMarkdownBody({
  thinking,
  isStreaming,
  sessionId,
  className,
}: {
  thinking: string;
  isStreaming: boolean;
  sessionId?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 max-w-full overflow-hidden text-muted-foreground/75 [&>div]:text-muted-foreground/75",
        THINKING_MARKDOWN_TYPOGRAPHY,
        className,
      )}
    >
      <MarkdownRenderer
        content={thinking}
        isAnimating={isStreaming}
        sessionId={sessionId}
      />
    </div>
  );
}

export function ThinkingWidget({
  thinking,
  duration,
  persistKey,
  sessionId,
  isStreamingMsg,
  isProgress,
  variant = "standalone",
}: {
  thinking: string;
  duration?: number;
  persistKey?: string;
  sessionId?: string;
  isStreamingMsg?: boolean;
  isProgress?: boolean;
  /** Inside ActivityFold — no extra fold chrome. */
  variant?: "standalone" | "nested";
}) {
  const [expanded, setExpanded] = useState(
    () => isProgress ? false : (persistKey ? getThinkingState(persistKey) : false),
  );
  const [elapsed, setElapsed] = useState(0);
  const globalStreaming = useChatStore((s) => s.isStreaming);
  const isStreaming = isStreamingMsg ?? globalStreaming;

  const toggleRef = useRef<HTMLButtonElement>(null);
  const pendingAnchorRef = useRef<ViewportAnchorCapture | null>(null);

  useLayoutEffect(() => {
    const anchor = toggleRef.current;
    const captured = pendingAnchorRef.current;
    if (!anchor || !captured) return;
    restoreViewportAnchor(captured, anchor);
    pendingAnchorRef.current = null;
  }, [expanded]);

  const toggleExpanded = () => {
    if (toggleRef.current) {
      pendingAnchorRef.current = captureViewportAnchor(toggleRef.current);
    }
    setExpanded((prev) => !prev);
  };

  useEffect(() => {
    if (persistKey) saveThinkingState(persistKey, expanded);
  }, [persistKey, expanded]);

  useEffect(() => {
    if (!isStreaming || isProgress) return;
    const start = Date.now();
    const timer = setInterval(() => {
      setElapsed((Date.now() - start) / 1000);
    }, 200);
    return () => clearInterval(timer);
  }, [isStreaming, isProgress]);

  const fmt = (s: number) => s.toFixed(1);

  // Suppress fractional seconds for the first 0.8s to avoid jittery
  // "0.0s" → "0.2s" → "0.4s" flicker. Then smoothly show the live timer.
  const showTimer = elapsed >= 0.8;

  // When done: prefer persisted duration, then frozen elapsed, then estimate.
  const frozenDuration = duration != null
    ? duration
    : (elapsed > 0 ? Math.round(elapsed * 10) / 10 : Math.max(0.1, Math.round(thinking.length / 5) / 10));

  if (variant === "nested") {
    if (isProgress) {
      return (
        <div className="py-0.5">
          <button
            type="button"
            className="flex items-center gap-2 py-0.5 text-[length:var(--font-chat-message)] text-muted-foreground/65"
            disabled
          >
            <BrainIcon className="size-3 shrink-0 opacity-70" />
            <span>Initialization</span>
          </button>
        </div>
      );
    }

    return (
      <div>
        <button
          ref={toggleRef}
          type="button"
          className="flex w-full items-center gap-2 py-0 text-left text-[length:var(--font-chat-message)] text-muted-foreground/65 hover:text-muted-foreground/80 transition-colors"
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggleExpanded}
        >
          <BrainIcon className="size-3 shrink-0 opacity-70" />
          <span className="tabular-nums">
            {isStreaming
              ? (showTimer ? `Thinking… ${fmt(elapsed)}s` : "Thinking…")
              : `Thought for ${fmt(frozenDuration)}s`}
          </span>
          <ChevronDownIcon
            className={cn(
              "size-3 shrink-0 text-muted-foreground/70 transition-transform duration-150",
              expanded ? "rotate-0" : "-rotate-90",
            )}
          />
        </button>
        {expanded ? (
          <ThinkingMarkdownBody
            thinking={thinking}
            isStreaming={isStreaming}
            sessionId={sessionId}
            className="pt-0 pb-0.5"
          />
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <button
        ref={toggleRef}
        type="button"
        className="flex items-center gap-2 py-0.5 text-[length:var(--font-chat-message)] text-muted-foreground/65 hover:text-muted-foreground/80 transition-colors group"
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggleExpanded}
      >
        <BrainIcon className="size-3.5 shrink-0" />
        <span
          className="tabular-nums transition-opacity duration-200"
          key={isStreaming ? "live" : "frozen"}
        >
          {isProgress
            ? "Initialization"
            : isStreaming
              ? (showTimer ? `Thinking… ${fmt(elapsed)}s` : "Thinking…")
              : `Thought for ${fmt(frozenDuration)}s`}
        </span>
        <ChevronDownIcon
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
            expanded ? "rotate-0" : "-rotate-90",
          )}
        />
      </button>
      {expanded && (
        <ThinkingMarkdownBody
          thinking={thinking}
          isStreaming={isStreaming}
          sessionId={sessionId}
          className={cn(TOOL_EXPANDED_CONTENT_CLASS, "py-1 text-[length:var(--font-chat-message)]")}
        />
      )}
    </div>
  );
}
