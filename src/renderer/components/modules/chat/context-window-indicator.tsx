import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CircularProgress } from "@/components/ui/circular-progress";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { ChevronDownIcon, Shrink } from "lucide-react";
import { useChatStore } from "@/stores/chat-store";
import { useDocumentStore } from "@/stores/document-store";
import { cn } from "@/lib/utils";

export interface CategorySchema {
  key: string;
  label: string;
  color: string;
  description?: string;
  order?: number;
}

interface ContextWindowIndicatorProps {
  /** Tokens used (null = unknown / after compact) */
  used?: number | null;
  /** Token limit — prefer OpenCode usage_update.size */
  total?: number;
  /** Two-bucket Prism estimate (prism-side / session-rest) */
  breakdown?: Record<string, number> | null;
  schema?: CategorySchema[] | null;
  source?: "usage_update" | "prompt_usage" | "estimate" | null;
  promptStale?: boolean;
  isStreaming?: boolean;
}

/**
 * Context ring: OpenCode used/size by default; optional two-bucket Prism estimate.
 */
export function ContextWindowIndicator({
  used = null,
  total = 128_000,
  breakdown,
  schema,
  source = null,
  promptStale = false,
  isStreaming = false,
}: ContextWindowIndicatorProps) {
  const { t } = useTranslation();
  const [compacting, setCompacting] = useState(false);
  const [estimateOpen, setEstimateOpen] = useState(false);
  const usedN = typeof used === "number" ? used : 0;
  const hasUsed = typeof used === "number";
  const pct = hasUsed && total > 0 ? Math.round((usedN / total) * 100) : 0;

  const prismSide = breakdown?.["prism-side"] ?? 0;
  const sessionRest = breakdown?.["session-rest"] ?? 0;
  const hasTwoBucket =
    hasUsed && (prismSide > 0 || sessionRest > 0 || (breakdown != null && Object.keys(breakdown).length > 0));

  const handleCompact = useCallback(async () => {
    const sessionId = useChatStore.getState().sessionId;
    const projectPath = useDocumentStore.getState().projectRoot;
    if (!sessionId || !projectPath) {
      toast.error("Start a conversation before compressing context.");
      return;
    }
    setCompacting(true);
    try {
      await window.electronAPI.chatCompact(sessionId, projectPath);
      useChatStore.getState()._setContextTokens(
        useChatStore.getState().activeTabId,
        null,
        {},
        undefined,
        { clear: true },
      );
      toast.success(t("chat.context.compressDone"));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to compact context.");
    } finally {
      setCompacting(false);
    }
  }, [t]);

  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted hover:text-muted-foreground transition-colors"
        >
          <CircularProgress value={pct} size={14} strokeWidth={1.5} />
          <span className="tabular-nums text-[length:var(--font-chat-meta)]">
            {hasUsed ? `${pct}%` : "—"}
          </span>
        </button>
      </HoverCardTrigger>
      <HoverCardContent side="top" align="end" className="w-64 p-3">
        <div className="space-y-3">
          <div className="flex items-center justify-between text-[length:var(--font-chat-meta)]">
            <span className="text-muted-foreground">{t("chat.context.window")}</span>
            <span className="font-medium text-foreground tabular-nums">
              {hasUsed ? usedN.toLocaleString() : "—"} / {total.toLocaleString()}
            </span>
          </div>

          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-muted-foreground transition-all"
              style={{ width: `${hasUsed ? pct : 0}%` }}
            />
          </div>

          {source === "usage_update" ? (
            <p className="text-[length:var(--font-hint)] text-muted-foreground">
              {t("chat.context.fromOpenCode")}
            </p>
          ) : source === "prompt_usage" ? (
            <p className="text-[length:var(--font-hint)] text-muted-foreground">
              {t("chat.context.fromPromptUsage")}
            </p>
          ) : !hasUsed ? (
            <p className="text-[length:var(--font-hint)] text-muted-foreground">
              {t("chat.context.waitingUsage")}
            </p>
          ) : null}

          {hasTwoBucket ? (
            <div className="border-t border-border pt-2">
              <button
                type="button"
                className="flex w-full items-center gap-1 text-left text-[length:var(--font-hint)] text-muted-foreground hover:text-foreground"
                onClick={() => setEstimateOpen((o) => !o)}
              >
                <ChevronDownIcon
                  className={cn(
                    "size-3 shrink-0 transition-transform",
                    estimateOpen ? "rotate-0" : "-rotate-90",
                  )}
                />
                <span className="flex-1">{t("chat.context.estimateToggle")}</span>
              </button>
              {estimateOpen ? (
                <div className="mt-2 space-y-1.5">
                  <p className="text-[length:var(--font-hint)] text-muted-foreground">
                    {t("chat.context.estimates")}
                  </p>
                  {(schema ?? [
                    { key: "prism-side", label: t("chat.context.bucketPrism"), color: "bg-primary" },
                    { key: "session-rest", label: t("chat.context.bucketRest"), color: "bg-muted-foreground" },
                  ]).map((cat) => {
                    const tokens = breakdown?.[cat.key] ?? 0;
                    if (tokens <= 0 && cat.key !== "prism-side" && cat.key !== "session-rest") {
                      return null;
                    }
                    const label =
                      cat.key === "prism-side"
                        ? t("chat.context.bucketPrism")
                        : cat.key === "session-rest"
                          ? t("chat.context.bucketRest")
                          : cat.label;
                    const catPct = usedN > 0 ? Math.round((tokens / usedN) * 100) : 0;
                    return (
                      <div
                        key={cat.key}
                        className="flex items-center gap-2 text-[length:var(--font-hint)]"
                      >
                        <span
                          className={cn("inline-block size-2 shrink-0 rounded-full", cat.color)}
                        />
                        <span className="flex-1 text-muted-foreground">{label}</span>
                        <span className="tabular-nums font-medium text-foreground">
                          {tokens.toLocaleString()}
                        </span>
                        <span className="w-10 text-right tabular-nums text-muted-foreground">
                          {catPct}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
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
