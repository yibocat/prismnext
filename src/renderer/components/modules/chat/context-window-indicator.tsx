import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CircularProgress } from "@/components/ui/circular-progress";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { Shrink } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat-store";
import { useDocumentStore } from "@/stores/document-store";
import { formatTokenCount } from "@shared/token-estimate";
import {
  contextBarSegments,
  occupancyExceedsWindow,
  type ContextBreakdownKey,
  type ContextUsageBreakdown,
} from "@shared/agent-context-usage";

/** Fixed categorical hues — not theme Brand (git/diff convention). */
const BREAKDOWN_COLORS: Record<ContextBreakdownKey, string> = {
  systemPrompt: "#8b8d94",
  tools: "#7c6af7",
  rules: "#3d9a5f",
  skills: "#e3942c",
  mcp: "#9b87f5",
  subagents: "#3b82f6",
  summarized: "#ec4899",
  conversation: "#e06c75",
};

function formatSpendUsd(n: number): string {
  if (!Number.isFinite(n) || n < 0.01) return "< $0.01";
  return `$${n.toFixed(2)}`;
}

interface ContextWindowIndicatorProps {
  /** Tokens used (null = unknown / after compact) */
  used?: number | null;
  /** Token limit — prefer live session usage size */
  total?: number;
  source?: "usage_update" | "prompt_usage" | "estimate" | null;
  /** Cumulative session spend in USD (Pi usage totals). */
  costUsd?: number | null;
  breakdown?: ContextUsageBreakdown | null;
  promptStale?: boolean;
  isStreaming?: boolean;
}

export function ContextWindowIndicator({
  used = null,
  total = 128_000,
  costUsd = null,
  breakdown = null,
  promptStale = false,
  isStreaming = false,
}: ContextWindowIndicatorProps) {
  const { t } = useTranslation();
  const [compacting, setCompacting] = useState(false);
  const usedN = typeof used === "number" ? used : 0;
  const hasUsed = typeof used === "number";
  const pct = hasUsed && total > 0 ? Math.round((usedN / total) * 100) : 0;

  const filledPct = hasUsed && total > 0 ? (usedN / total) * 100 : 0;
  const exceedsWindow = occupancyExceedsWindow(used, total);
  const segments = useMemo(() => {
    if (total <= 0) return [];
    return contextBarSegments(breakdown, usedN, total).map((seg) => ({
      ...seg,
      color: BREAKDOWN_COLORS[seg.key],
    }));
  }, [breakdown, usedN, total]);
  const showSegmentGaps = pct >= 5 && segments.length > 1;

  const handleCompact = useCallback(async () => {
    const chatState = useChatStore.getState();
    const conversationId = chatState.activeTabId || chatState.sessionId;
    const projectPath = useDocumentStore.getState().projectRoot;
    if (!conversationId || !projectPath) {
      toast.error("Start a conversation before compressing context.");
      return;
    }
    setCompacting(true);
    try {
      const result = await window.electronAPI.agentCompact({ conversationId });
      if (!result.ok) {
        throw new Error(result.error || "Failed to compact context.");
      }
      const tabId = useChatStore.getState().activeTabId;
      if (tabId && typeof result.throughTurnIndex === "number") {
        useChatStore.getState().applyConversationCompact(tabId, {
          throughTurnIndex: result.throughTurnIndex,
          ...(result.summary ? { summary: result.summary } : {}),
        });
      }
      useChatStore.getState()._setContextTokens(
        useChatStore.getState().activeTabId,
        null,
        { clearOccupancy: true },
      );
      toast.success(t("chat.context.compressDone"));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to compact context.");
    } finally {
      setCompacting(false);
    }
  }, [t]);

  const spendValue = typeof costUsd === "number" && Number.isFinite(costUsd) ? costUsd : 0;
  const costLabel = formatSpendUsd(spendValue);

  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-muted hover:text-muted-foreground transition-colors"
        >
          <span className="tabular-nums">
            {costLabel}
          </span>
          <CircularProgress value={pct} size={14} strokeWidth={1.5} />
          <span className="tabular-nums">
            {hasUsed ? `${pct}%` : "—"}
          </span>
        </button>
      </HoverCardTrigger>
      <HoverCardContent side="top" align="end" className="w-72 p-3">
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[length:var(--font-chat-meta)] font-medium text-foreground">
                {t("chat.context.title")}
              </div>
              <div className="text-[length:var(--font-hint)] text-muted-foreground">
                {hasUsed ? t("chat.context.pctUsed", { pct }) : t("chat.context.waitingUsage")}
              </div>
            </div>
            <div className="text-right text-[length:var(--font-chat-meta)] tabular-nums text-muted-foreground">
              {hasUsed ? `~${formatTokenCount(usedN)}` : "—"} / {formatTokenCount(total)}
            </div>
          </div>

          <div
            className={cn(
              "flex h-1.5 w-full overflow-hidden rounded-full bg-muted",
              showSegmentGaps && "gap-[2px]",
            )}
          >
            {segments.length > 0 ? (
              segments.map((seg) => (
                <div
                  key={seg.key}
                  className={cn("h-full min-w-0 shrink-0", showSegmentGaps && "rounded-full")}
                  style={{ width: `${seg.widthPct}%`, backgroundColor: seg.color }}
                />
              ))
            ) : (
              <div
                className="h-full rounded-full bg-muted-foreground transition-all"
                style={{ width: `${Math.min(100, filledPct)}%` }}
              />
            )}
          </div>

          {segments.length > 0 ? (
            <ul className="space-y-1">
              {segments.map((seg) => (
                <li
                  key={seg.key}
                  className="flex items-center justify-between gap-2 text-[length:var(--font-chat-meta)]"
                >
                  <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                    <span
                      className="size-2 shrink-0 rounded-[2px]"
                      style={{ backgroundColor: seg.color }}
                    />
                    <span className="truncate">{t(`chat.context.categories.${seg.key}`)}</span>
                  </span>
                  <span className="tabular-nums text-foreground">
                    {formatTokenCount(seg.tokens)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="flex items-center justify-between text-[length:var(--font-chat-meta)]">
            <span className="text-muted-foreground">{t("chat.context.spent")}</span>
            <span className="font-medium text-foreground tabular-nums">{costLabel}</span>
          </div>

          {exceedsWindow ? (
            <p className="text-[length:var(--font-hint)] text-foreground/60">
              {t("chat.context.windowExceeds")}
            </p>
          ) : null}

          {promptStale ? (
            <p className="text-[length:var(--font-hint)] text-foreground/60">
              {t("chat.context.promptStale")}
            </p>
          ) : null}

          <button
            type="button"
            disabled={isStreaming || compacting || !hasUsed}
            onClick={() => void handleCompact()}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border bg-muted px-2.5 py-1.5 text-[length:var(--font-chat-meta)] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Shrink className="size-3" />
            {compacting ? t("chat.context.compressing") : t("chat.context.compress")}
          </button>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
