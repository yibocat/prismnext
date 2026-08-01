import { useState, memo } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { useChatStore } from "@/stores/chat-store";
import { parsePlanSteps } from "@/lib/chat/parse-plan-steps";
import {
  ClipboardListIcon,
  CheckIcon,
  CircleIcon,
  Loader2Icon,
  ChevronDownIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TOOL_INLINE_ROW_CLASS,
  TOOL_EXPANDED_CONTENT_CLASS,
  StatusIcon,
} from "./shared";

export const PlanWidget = memo(function PlanWidget({
  toolUse,
  toolName,
}: {
  toolUse: ContentBlock;
  toolName: string;
}) {
  const steps = parsePlanSteps(toolUse.input);
  const isStreaming = useChatStore((s) => s.isStreaming);
  // Always start collapsed — same as TodoWrite / Worked for / Thought.
  const [expanded, setExpanded] = useState(false);

  if (steps.length === 0) return null;

  const completed = steps.filter((s) => s.status === "completed").length;
  const hasInProgress = steps.some((s) => s.status === "in_progress");
  const allDone = completed === steps.length;
  const isLoading = isStreaming && hasInProgress && !allDone;

  return (
    <div>
      <button
        type="button"
        className={cn(
          TOOL_INLINE_ROW_CLASS,
          "text-left text-[length:var(--font-chat-message)] py-1",
        )}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <StatusIcon isLoading={isLoading} isError={false} />
        <span className="shrink-0 text-muted-foreground/55 tabular-nums">
          {toolName}
        </span>
        <ClipboardListIcon className="size-3.5 shrink-0 text-plan" />
        <span className="shrink-0 text-muted-foreground/70">Checklist</span>
        <span className="shrink-0 text-muted-foreground/55 tabular-nums">
          {completed}/{steps.length}
        </span>
        <ChevronDownIcon
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
            expanded ? "rotate-0" : "-rotate-90",
          )}
        />
      </button>
      {expanded && (
        <div className={cn(TOOL_EXPANDED_CONTENT_CLASS, "py-1.5")}>
          {steps.map((step, i) => (
            <div key={i} className="flex items-center gap-2 py-1">
              {step.status === "completed" ? (
                <CheckIcon className="size-3.5 text-success shrink-0" />
              ) : step.status === "in_progress" && isStreaming ? (
                <Loader2Icon className="size-3.5 animate-spin text-info shrink-0" />
              ) : step.status === "in_progress" ? (
                <CircleIcon className="size-3.5 text-info shrink-0" />
              ) : (
                <CircleIcon className="size-3.5 text-muted-foreground shrink-0" />
              )}
              <span
                className={cn(
                  "text-[length:var(--font-chat-meta)]",
                  step.status === "completed" && "line-through text-muted-foreground",
                )}
              >
                {step.text}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
