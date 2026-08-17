import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CircularProgress } from "@/components/ui/circular-progress";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { Shrink } from "lucide-react";
import { useChatStore } from "@/stores/chat-store";
import { useDocumentStore } from "@/stores/document-store";

interface ContextWindowIndicatorProps {
  /** Tokens used (null = unknown / after compact) */
  used?: number | null;
  /** Token limit — prefer OpenCode usage_update.size */
  total?: number;
  source?: "usage_update" | "prompt_usage" | "estimate" | null;
  promptStale?: boolean;
  isStreaming?: boolean;
}

/** Context ring: OpenCode used / size only — no local category estimates. */
export function ContextWindowIndicator({
  used = null,
  total = 128_000,
  source = null,
  promptStale = false,
  isStreaming = false,
}: ContextWindowIndicatorProps) {
  const { t } = useTranslation();
  const [compacting, setCompacting] = useState(false);
  const usedN = typeof used === "number" ? used : 0;
  const hasUsed = typeof used === "number";
  const pct = hasUsed && total > 0 ? Math.round((usedN / total) * 100) : 0;

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
      useChatStore.getState()._setContextTokens(
        useChatStore.getState().activeTabId,
        null,
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
