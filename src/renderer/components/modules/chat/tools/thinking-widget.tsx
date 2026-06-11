import { useState, useEffect } from "react";
import { useChatStore } from "@/stores/chat-store";
import { BrainIcon, ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

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
  /** Whether THIS message is still being streamed (not a global flag). */
  isStreamingMsg?: boolean;
  /** When true, this is init progress (not real AI thinking).
   *  Shows "Initialization" label, defaults collapsed, no timer. */
  isProgress?: boolean;
}) {
  const [expanded, setExpanded] = useState(
    () => isProgress ? false : (persistKey ? getThinkingState(persistKey) : false),
  );
  const [elapsed, setElapsed] = useState(0);
  // Fall back to global isStreaming if prop not provided (backward compat).
  const globalStreaming = useChatStore((s) => s.isStreaming);
  const isStreaming = isStreamingMsg ?? globalStreaming;

  const toggleExpanded = () => setExpanded((prev) => !prev);

  useEffect(() => {
    if (persistKey) saveThinkingState(persistKey, expanded);
  }, [persistKey, expanded]);

  useEffect(() => {
    if (!isStreaming || isProgress) return;
    const start = Date.now();
    const timer = setInterval(() => {
      setElapsed((Date.now() - start) / 1000);
    }, 100);
    return () => clearInterval(timer);
  }, [isStreaming, isProgress]);

  // Format a duration in seconds to 1 decimal place.
  const fmt = (s: number) => s.toFixed(1);

  const estimatedDuration = Math.max(0.1, thinking.length / 50);
  // When the timer stops (thinking complete or message finished), use the
  // frozen elapsed value — it reflects actual thinking time, not total response time.
  const displayDuration = !isStreaming
    ? (duration != null ? duration : (elapsed > 0 ? elapsed : estimatedDuration))
    : elapsed;

  return (
    <div className="my-1.5">
      <button
        type="button"
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors group"
        onClick={toggleExpanded}
      >
        <BrainIcon className="size-3.5" />
        <span className="text-[length:var(--font-code)]">
          {isProgress
            ? "Initialization"
            : (isStreaming ? `Thinking... ${fmt(elapsed)}s` : `Thought for ${fmt(displayDuration)}s`)}
        </span>
        <ChevronDownIcon
          className={cn("size-3.5 transition-transform ml-auto", expanded && "rotate-180")}
        />
      </button>
      {expanded && (
        <div className="mt-1.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-[length:var(--font-code)] text-muted-foreground whitespace-pre-wrap leading-relaxed animate-in fade-in slide-in-from-top-1 duration-150">
          {thinking}
        </div>
      )}
    </div>
  );
}
