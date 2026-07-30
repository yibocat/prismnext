import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLinkIcon, FlaskConicalIcon, Loader2Icon } from "lucide-react";
import { useChatStore } from "@/stores/chat-store";
import { useExperimentStore } from "@/stores/experiment-store";
import {
  resolveComposerPendingExperimentRun,
  selectComposerHostedExperimentRunId,
} from "@/lib/chat/composer-pending-experiment";
import { openExperimentInPanel } from "@/modes/experiments-mode/open-experiment";
import { ComposerChromeCard } from "./composer-chrome-card";
import { cn } from "@/lib/utils";

function shortCommand(command: string, max = 64): string {
  const normalized = command.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
}

export function ExperimentRunBar() {
  const { t } = useTranslation();
  const experimentRunId = useChatStore(selectComposerHostedExperimentRunId);
  const streamTick = useChatStore((s) => s.streamTick);
  const runInFlight = useExperimentStore((s) => s.runInFlight);

  const pending = useMemo(() => {
    if (!experimentRunId && !runInFlight) return null;
    return resolveComposerPendingExperimentRun(useChatStore.getState());
  }, [experimentRunId, runInFlight?.runId, streamTick]);

  const experimentId = runInFlight?.id ?? pending?.experimentId ?? null;
  const command = runInFlight?.command || pending?.command || "";
  const isLive = runInFlight != null && (!experimentId || runInFlight.id === experimentId);

  if (!experimentId && !command) return null;

  return (
    <ComposerChromeCard>
      <button
        type="button"
        className="flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
        onClick={() => {
          if (experimentId) void openExperimentInPanel(experimentId);
        }}
      >
        {isLive ? (
          <Loader2Icon className="mt-0.5 size-3.5 shrink-0 animate-spin text-info" />
        ) : (
          <FlaskConicalIcon className="mt-0.5 size-3.5 shrink-0 text-info" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-[length:var(--font-chat-meta)] font-medium text-foreground">
            {t("chat.composer.experimentRunTitle")}
          </span>
          {command ? (
            <span
              className="mt-0.5 block truncate font-mono text-[length:var(--font-chat-meta)] text-muted-foreground"
              title={command}
            >
              {shortCommand(command, 80)}
            </span>
          ) : null}
          {isLive ? (
            <span className="mt-1 block text-[length:var(--font-chat-meta)] text-info">
              {t("chat.composer.experimentRunLive")}
            </span>
          ) : null}
        </span>
        <span
          className={cn(
            "mt-0.5 inline-flex shrink-0 items-center gap-1 text-[length:var(--font-chat-meta)] text-muted-foreground",
          )}
        >
          <ExternalLinkIcon className="size-3" />
          {t("chat.composer.experimentRunOpen")}
        </span>
      </button>
    </ComposerChromeCard>
  );
}
