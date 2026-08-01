import { memo } from "react";
import { useTranslation } from "react-i18next";
import type { ContentBlock } from "@/stores/chat-store";
import { useChatStore } from "@/stores/chat-store";
import { BotIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CHAT_CHROME_BUTTON_TEXT } from "../worktree-selector";
import { StatusIcon, param } from "./shared";
import { isBackgroundTaskStartedResult } from "@shared/opencode-background-task";

/** OpenCode built-in subagent types */
const OPENCODE_AGENT_META: Record<string, { label: string; desc: string }> = {
  general: { label: "General", desc: "Complex multi-step research and tasks" },
  explore: { label: "Explore", desc: "Fast read-only codebase search" },
  scout: { label: "Scout", desc: "External docs and dependency research" },
  plan: { label: "Plan", desc: "Read-only analysis and planning" },
  build: { label: "Build", desc: "Full development with all tools" },
};

/** prismnext synced expert ids */
const PRISM_EXPERT_META: Record<string, { label: string; desc: string }> = {
  "research-prism": {
    label: "prismnext",
    desc: "Primary research orchestrator",
  },
  "literature-synthesizer": {
    label: "Literature Synthesizer",
    desc: "Cross-paper synthesis by theme — gaps, disagreements, confidence",
  },
  "research-design-coach": {
    label: "Research Design Coach",
    desc: "Pressure-tests research questions, hypotheses, and contribution",
  },
  "methodology-auditor": {
    label: "Methodology Auditor",
    desc: "Audits experimental design, statistical validity, reproducibility",
  },
  "structure-diagnostician": {
    label: "Structure Diagnostician",
    desc: "Diagnoses manuscript structure and argument chain",
  },
  "peer-reviewer": {
    label: "Peer Reviewer",
    desc: "Simulates an independent reviewer with a decision recommendation",
  },
};

function humanizeAgentId(id: string): string {
  return id
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function resolveTaskAgentMeta(agentType: string): { label: string; desc: string } {
  if (!agentType || agentType === "expert") {
    return { label: "Subagent", desc: "Delegated Task (type pending)" };
  }
  return (
    PRISM_EXPERT_META[agentType]
    ?? OPENCODE_AGENT_META[agentType]
    ?? { label: humanizeAgentId(agentType) || "Sub-agent", desc: "" }
  );
}

/** i18n key under `chat.subagent.*` when activity stream is empty / not linked. */
export type TaskActivityEmptyHintKey = "activityLinking" | "activityMissing";

/** Soft hint when expert finished but activity blocks never linked (not a cancel). */
export function taskActivityEmptyHint(run: {
  status?: string;
  blocks: unknown[];
  error?: string;
  linkDegraded?: boolean;
} | null | undefined): TaskActivityEmptyHintKey | null {
  if (!run || run.error?.trim()) return null;
  if (run.status === "running" && run.linkDegraded && run.blocks.length === 0) {
    return "activityLinking";
  }
  if (run.status === "done" && run.blocks.length === 0) {
    return "activityMissing";
  }
  return null;
}

/**
 * Task / subagent row — two lines, opens the composer-above run panel (not an
 * inline ToolCard expand). Stop aborts the child session for the main agent.
 */
export const TaskWidget = memo(function TaskWidget({
  toolUse,
  toolResult,
  toolName: _toolName,
}: {
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
  toolName: string;
}) {
  const { t } = useTranslation();
  const toolUseId = toolUse.id || "";
  const subAgentRun = useChatStore(
    (s) => s.tabs.find((t) => t.id === s.activeTabId)?.subAgentRuns?.[toolUseId] ?? null,
  );
  const openSubAgentPanel = useChatStore((s) => s.openSubAgentPanel);
  const cancelSubAgentRun = useChatStore((s) => s.cancelSubAgentRun);

  const isStopping = subAgentRun?.status === "stopping";
  const bgStartedStub =
    !!toolResult
    && isBackgroundTaskStartedResult({
      rawInput: toolUse.input ?? toolUse._backfillInput,
      content: toolResult.content,
    });
  // Background Tasks get an early tool_result ("started") while the child still runs —
  // drive loading from SubAgentRun status, not merely presence of tool_result.
  const isLoading =
    isStopping
    || subAgentRun?.status === "running"
    || (bgStartedStub && subAgentRun?.status !== "done" && subAgentRun?.status !== "error")
    || (!toolResult && subAgentRun?.status !== "done" && subAgentRun?.status !== "error");
  const isError =
    !!(toolResult?.is_error || (subAgentRun?.status === "error" && subAgentRun?.error));
  const isBackground = subAgentRun?.mode === "background" || bgStartedStub;

  const prompt =
    param(toolUse.input, "prompt")
    || param(toolUse.input, "description")
    || subAgentRun?.prompt
    || "";
  const rawAgent = (
    param(toolUse.input, "agent")
    || param(toolUse.input, "subagent_type")
    || (subAgentRun?.expertId && subAgentRun.expertId !== "expert" ? subAgentRun.expertId : "")
    || subAgentRun?.expertId
    || ""
  )
    .replace(/^@/, "")
    .toLowerCase();
  const agentType = rawAgent || "expert";
  const meta = resolveTaskAgentMeta(agentType);
  const activityHintKey = taskActivityEmptyHint(subAgentRun);
  const statusLine = isStopping
    ? t("chat.subagent.stopping")
    : isLoading
      ? (isBackground
        ? t("chat.subagent.backgroundRunning")
        : activityHintKey === "activityLinking"
          ? t("chat.subagent.activityLinkingShort")
          : t("chat.subagent.running"))
      : isError
        ? t("chat.subagent.stopped")
        : t("chat.subagent.done");
  const promptPreview = prompt
    ? prompt.length > 80
      ? `${prompt.slice(0, 80)}…`
      : prompt
    : meta.desc;
  // Card second line: keep prompt while linking; show missing-stream note when done empty.
  const secondLine =
    activityHintKey === "activityMissing"
      ? t("chat.subagent.activityMissing")
      : (promptPreview || t("chat.subagent.openHint"));

  return (
    <div className="group flex w-full min-w-0 max-w-full items-center gap-0.5">
      <button
        type="button"
        className={cn(
          "flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5 py-1.5 pl-1.5 pr-1 text-left",
          "text-[length:var(--font-chat-message)] text-muted-foreground/65",
          "transition-colors hover:text-muted-foreground/80",
          "outline-none focus:outline-none focus-visible:outline-none",
        )}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (toolUseId) openSubAgentPanel(toolUseId);
        }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <StatusIcon isLoading={!!isLoading} isError={!!isError} />
          <BotIcon className="size-3.5 shrink-0 opacity-80" />
          <span className="min-w-0 truncate font-medium">
            Task @{meta.label}
          </span>
          <span className="shrink-0 text-[length:var(--font-chat-meta)]">
            {statusLine}
          </span>
        </div>
        <div className="min-w-0 truncate pl-[1.625rem] text-[length:var(--font-chat-meta)]">
          {secondLine}
        </div>
      </button>

      {isLoading && !isStopping ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className={cn("mr-0.5 shrink-0 text-muted-foreground", CHAT_CHROME_BUTTON_TEXT)}
          onClick={(e) => {
            e.stopPropagation();
            if (toolUseId) void cancelSubAgentRun(toolUseId);
          }}
        >
          {t("chat.subagent.stop")}
        </Button>
      ) : null}
    </div>
  );
});
