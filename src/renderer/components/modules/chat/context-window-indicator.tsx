import { CircularProgress } from "@/components/ui/circular-progress";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { Shrink } from "lucide-react";

interface ContextWindowIndicatorProps {
  /** Tokens used (default 0 for placeholder) */
  used?: number;
  /** Token limit (default 200000 for placeholder) */
  total?: number;
}

/**
 * Compact context-window usage indicator for chat sessions.
 * Shows a circular progress ring with percentage, and a HoverCard
 * with detailed breakdown and context compression controls.
 */
export function ContextWindowIndicator({
  used = 24000,
  total = 200000,
}: ContextWindowIndicatorProps) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;

  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted hover:text-muted-foreground transition-colors"
        >
          <CircularProgress value={pct} size={14} strokeWidth={1.5} />
          <span className="tabular-nums">{pct}%</span>
        </button>
      </HoverCardTrigger>
      <HoverCardContent side="top" align="end" className="w-56 p-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[length:var(--font-chat-meta)]">
            <span className="text-muted-foreground">Context window</span>
            <span className="font-medium text-foreground">
              {used.toLocaleString()} / {total.toLocaleString()}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-muted-foreground/40 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-[length:var(--font-hint)] text-foreground/60">
            Long conversations may degrade response quality. Compress to
            summarize the conversation and free up space.
          </p>
          <button
            type="button"
            disabled
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border bg-muted/50 px-2.5 py-1.5 text-[length:var(--font-chat-meta)] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Shrink className="size-3" />
            Compress context
          </button>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
