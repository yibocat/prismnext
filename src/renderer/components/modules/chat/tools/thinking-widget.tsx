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

export function ThinkingWidget({
  thinking,
  duration,
  persistKey,
  isStreamingMsg,
  isProgress,
}: {
  thinking: string;
  duration?: number;
  persistKey?: string;
  isStreamingMsg?: boolean;
  isProgress?: boolean;
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

  return (
    <div>
      <button
        ref={toggleRef}
        type="button"
        className="flex items-center gap-2 py-1 text-[length:var(--font-chat-message)] text-muted-foreground/65 hover:text-muted-foreground/80 transition-colors group"
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
        <div className={cn(TOOL_EXPANDED_CONTENT_CLASS, "text-muted-foreground whitespace-pre-wrap leading-relaxed")}>
          {thinking}
        </div>
      )}
    </div>
  );
}
