import { CircularProgress } from "@/components/ui/circular-progress";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { Shrink } from "lucide-react";

export interface CategorySchema {
  key: string;
  label: string;
  color: string;
  description?: string;
  order?: number;
}

interface ContextWindowIndicatorProps {
  /** Tokens used (null = no conversation yet) */
  used?: number;
  /** Token limit (default 200000 for placeholder) */
  total?: number;
  /** Categorized breakdown (null = no data) */
  breakdown?: Record<string, number> | null;
  /** Category definitions from agent's calculator */
  schema?: CategorySchema[] | null;
}

interface CategoryDef {
  key: string;
  label: string;
  tokens: number;
  color: string;
}

function buildCategories(breakdown: Record<string, number>, schema: CategorySchema[]): CategoryDef[] {
  // Pre-build order map for O(n log n) sort
  const orderMap = new Map(schema.map((s) => [s.key, s.order ?? 999]));
  return schema
    .map((s) => ({
      key: s.key,
      label: s.label,
      tokens: breakdown[s.key] ?? 0,
      color: s.color,
    }))
    .sort((a, b) => (orderMap.get(a.key) ?? 999) - (orderMap.get(b.key) ?? 999));
}

/**
 * Compact context-window usage indicator for chat sessions.
 * Shows a circular progress ring with percentage. On hover, displays
 * a categorized breakdown with a color-coded stacked progress bar
 * (similar to Cursor's context window panel).
 */
export function ContextWindowIndicator({
  used = 0,
  total = 200000,
  breakdown,
  schema,
}: ContextWindowIndicatorProps) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  const categories = breakdown && schema ? buildCategories(breakdown, schema) : [];
  const hasBreakdown = categories.length > 0 && used > 0;

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
      <HoverCardContent side="top" align="end" className="w-64 p-3">
        <div className="space-y-3">
          {/* Header: total used / limit */}
          <div className="flex items-center justify-between text-[length:var(--font-chat-meta)]">
            <span className="text-muted-foreground">Context window</span>
            <span className="font-medium text-foreground tabular-nums">
              {used.toLocaleString()} / {total.toLocaleString()}
            </span>
          </div>

          {/* Color-coded stacked progress bar */}
          {hasBreakdown ? (
            <div className="flex h-2 rounded-full overflow-hidden gap-px bg-muted">
              {categories.map((cat) => {
                const w = (cat.tokens / total) * 100;
                if (w <= 0) return null;
                return (
                  <div
                    key={cat.key}
                    className={`h-full ${cat.color} first:rounded-l-full last:rounded-r-full`}
                    style={{ width: `${w}%` }}
                  />
                );
              })}
              {/* Remaining space = unused capacity */}
              {used < total && (
                <div
                  className="h-full bg-muted-foreground/10 flex-1 rounded-r-full"
                />
              )}
            </div>
          ) : (
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-muted-foreground/40 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          )}

          {/* Legend: category → tokens → percentage */}
          {hasBreakdown && (
            <div className="space-y-1">
              {categories.map((cat) => {
                const catPct = total > 0 ? Math.round((cat.tokens / total) * 100) : 0;
                return (
                  <div
                    key={cat.key}
                    className="flex items-center gap-2 text-[length:var(--font-hint)]"
                  >
                    <span
                      className={`inline-block size-2 rounded-full shrink-0 ${cat.color}`}
                    />
                    <span className="flex-1 text-muted-foreground">{cat.label}</span>
                    <span className="tabular-nums text-foreground font-medium">
                      {cat.tokens.toLocaleString()}
                    </span>
                    <span className="tabular-nums text-muted-foreground w-10 text-right">
                      {catPct}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer: hint + compress button */}
          <p className="text-[length:var(--font-hint)] text-foreground/60">
            Long conversations may degrade response quality. Compress to
            summarize the conversation and free up space.
          </p>
          <button
            type="button"
            disabled
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border bg-muted/50 px-2.5 py-1.5 text-[length:var(--font-chat-meta)] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Shrink className="size-3" />
            Compress context
          </button>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
