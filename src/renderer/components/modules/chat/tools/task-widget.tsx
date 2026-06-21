import { useState, memo } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { BotIcon } from "lucide-react";
import { ToolCard, param } from "./shared";

/** Sub-agent type labels and descriptions from OpenCode */
const AGENT_META: Record<string, { label: string; desc: string }> = {
  general: { label: "General", desc: "Complex multi-step research and tasks" },
  explore: { label: "Explore", desc: "Fast read-only codebase search" },
  scout: { label: "Scout", desc: "External docs and dependency research" },
  plan: { label: "Plan", desc: "Read-only analysis and planning" },
  build: { label: "Build", desc: "Full development with all tools" },
};

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
  const isLoading = !toolResult;
  const isError = toolResult?.is_error;

  const prompt = param(toolUse.input, "prompt") || param(toolUse.input, "description") || "";
  const agentType = (param(toolUse.input, "agent") || param(toolUse.input, "subagent_type") || "general")
    .replace(/^@/, "")
    .toLowerCase();
  const taskId = param(toolUse.input, "task_id", "taskId") || "";
  const meta = AGENT_META[agentType] || { label: agentType || "Sub-agent", desc: "" };
  const isResuming = !!taskId;

  // During initial display (before backfill), agentType may default to
  // "general" since rawInput is empty.  After backfill, the real
  // subagent_type (e.g. "explore") is patched in.
  const hasRealInput = !!(prompt || agentType !== "general");

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
      hasContent={!!toolResult?.content}
      bodyClassName="font-mono whitespace-pre-wrap text-muted-foreground max-h-80 overflow-y-auto"
    >
      {() => (
        <>
          <div className="text-[length:var(--font-chat-meta)] text-muted-foreground/70 mb-1">
            {meta.desc}
            {isResuming && <span className="ml-2">· {taskId}</span>}
          </div>
          {prompt && (
            <div className="bg-muted/50 rounded px-2 py-1.5 mt-1 text-foreground/80">
              {prompt.slice(0, 500)}
              {prompt.length > 500 && "…"}
            </div>
          )}
          <div className="mt-2 pt-2 border-t border-border/50">
            {(() => {
              const raw = (typeof toolResult?.content === "string"
                ? toolResult.content
                : JSON.stringify(toolResult?.content ?? "", null, 2)) || "";
              return raw.length > 2000
                ? raw.slice(0, 2000) + `\n\n··· ${raw.length - 2000} more chars`
                : raw;
            })()}
          </div>
        </>
      )}
    </ToolCard>
  );
});
