import { useState, memo, useMemo } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { useChatStore } from "@/stores/chat-store";
import { BotIcon } from "lucide-react";
import { ToolCard, param } from "./shared";
import { AssistantBlockList } from "../assistant-block-list";
import { buildToolResultMapFromBlocks } from "./tool-result-map";
import {
  formatOrchestratorBuiltinTaskDeniedMessage,
  isOpaqueTaskCancelledResult,
} from "../../../../../shared/task-deny-message";

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

function resolveAgentMeta(agentType: string): { label: string; desc: string } {
  return (
    PRISM_EXPERT_META[agentType]
    ?? OPENCODE_AGENT_META[agentType]
    ?? { label: humanizeAgentId(agentType) || "Sub-agent", desc: "" }
  );
}

export const TaskWidget = memo(function TaskWidget({
  toolUse,
  toolResult,
  toolName,
}: {
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
  toolName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const toolUseId = toolUse.id || "";
  const subAgentRun = useChatStore(
    (s) => s.tabs.find((t) => t.id === s.activeTabId)?.subAgentRuns?.[toolUseId] ?? null,
  );
  const parentSessionId = useChatStore(
    (s) => s.tabs.find((t) => t.id === s.activeTabId)?.sessionId ?? "",
  );

  const isLoading = !toolResult && subAgentRun?.status !== "done" && subAgentRun?.status !== "error";
  const isError = toolResult?.is_error || subAgentRun?.status === "error";

  const prompt =
    param(toolUse.input, "prompt")
    || param(toolUse.input, "description")
    || subAgentRun?.prompt
    || "";
  const agentType = (
    param(toolUse.input, "agent")
    || param(toolUse.input, "subagent_type")
    || subAgentRun?.expertId
    || "general"
  )
    .replace(/^@/, "")
    .toLowerCase();
  const taskId = param(toolUse.input, "task_id", "taskId") || "";
  const meta = resolveAgentMeta(agentType);
  const isResuming = !!taskId;

  const hasRealInput = !!(prompt || agentType !== "general");
  const activityBlocks = subAgentRun?.blocks ?? [];
  const activityStreaming = subAgentRun?.status === "running";
  const activityToolResultMap = useMemo(
    () => buildToolResultMapFromBlocks(activityBlocks, { isStreaming: activityStreaming }),
    [activityBlocks, activityStreaming],
  );
  const hasExpandableContent =
    !!prompt
    || activityBlocks.length > 0
    || !!toolResult?.content
    || isLoading;

  const label = isResuming
    ? "Task (resume)"
    : isLoading && !hasRealInput
      ? "Task…"
      : `Task @${meta.label}`;

  return (
    <ToolCard
      toolName={toolName}
      icon={<BotIcon className="size-3.5 text-primary" />}
      label={<span className="font-medium truncate">{label}</span>}
      meta={prompt ? (
        <span className="text-muted-foreground/70 truncate text-[length:var(--font-chat-meta)]">
          {prompt.slice(0, 60)}{prompt.length > 60 && "…"}
        </span>
      ) : undefined}
      expanded={expanded}
      onToggle={() => setExpanded(!expanded)}
      isLoading={isLoading}
      isError={!!isError}
      hasContent={hasExpandableContent}
      bodyClassName="max-h-96 overflow-y-auto"
    >
      {() => (
        <>
          <div className="text-[length:var(--font-chat-meta)] text-muted-foreground/70 mb-1">
            {meta.desc}
            {subAgentRun?.status === "running" ? (
              <span className="ml-2 text-primary">· Expert running</span>
            ) : null}
            {isResuming && <span className="ml-2">· {taskId}</span>}
          </div>
          {prompt ? (
            <div className="bg-muted/50 rounded px-2 py-1.5 mt-1 text-foreground/80">
              <p className="text-[length:var(--font-size-11)] uppercase tracking-wide text-muted-foreground mb-1">
                Delegation prompt
              </p>
              {prompt.slice(0, 800)}
              {prompt.length > 800 && "…"}
            </div>
          ) : null}

          {activityBlocks.length > 0 ? (
            <div className="mt-3 space-y-2">
              <p className="text-[length:var(--font-size-11)] uppercase tracking-wide text-muted-foreground">
                Expert activity
              </p>
              <div className="min-w-0 max-w-full overflow-hidden">
                <AssistantBlockList
                  blocks={activityBlocks}
                  toolResultMap={activityToolResultMap}
                  msgIndex={0}
                  isStreamingMsg={activityStreaming}
                  sessionId={parentSessionId}
                />
              </div>
            </div>
          ) : isLoading ? (
            <p className="mt-2 text-[length:var(--font-size-12)] text-muted-foreground">
              Waiting for expert session…
            </p>
          ) : null}

          {toolResult?.content ? (
            <div className="mt-2 pt-2 border-t border-border/50">
              <p className="text-[length:var(--font-size-11)] uppercase tracking-wide text-muted-foreground mb-1">
                Task result
              </p>
              <pre className="font-mono whitespace-pre-wrap text-muted-foreground text-[length:var(--font-size-12)]">
                {(() => {
                  let raw =
                    (typeof toolResult.content === "string"
                      ? toolResult.content
                      : JSON.stringify(toolResult.content ?? "", null, 2)) || "";
                  if (toolResult.is_error && isOpaqueTaskCancelledResult(raw)) {
                    raw = formatOrchestratorBuiltinTaskDeniedMessage(agentType);
                  }
                  return raw.length > 2000
                    ? raw.slice(0, 2000) + `\n\n··· ${raw.length - 2000} more chars`
                    : raw;
                })()}
              </pre>
            </div>
          ) : null}
        </>
      )}
    </ToolCard>
  );
});
