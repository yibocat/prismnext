import { useState, useEffect, memo } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { useChatStore } from "@/stores/chat-store";
import {
  ListTodoIcon,
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

function getTodoExpandedState(key: string): boolean {
  return localStorage.getItem(`todo:${key}`) === "open";
}

function saveTodoExpandedState(key: string, open: boolean): void {
  if (open) {
    localStorage.setItem(`todo:${key}`, "open");
  } else {
    localStorage.removeItem(`todo:${key}`);
  }
}

export const TodoWriteWidget = memo(function TodoWriteWidget({
  toolUse,
  toolName,
}: {
  toolUse: ContentBlock;
  toolName: string;
}) {
  const todos: Array<{ content: string; status: string }> = toolUse.input?.todos || [];
  const isStreaming = useChatStore((s) => s.isStreaming);
  const persistKey = toolUse.id || undefined;

  const [expanded, setExpanded] = useState(
    () => (persistKey ? getTodoExpandedState(persistKey) : false),
  );

  useEffect(() => {
    if (persistKey) saveTodoExpandedState(persistKey, expanded);
  }, [persistKey, expanded]);

  if (todos.length === 0) return null;

  const completed = todos.filter((t) => t.status === "completed").length;
  const hasInProgress = todos.some((t) => t.status === "in_progress");
  const allDone = completed === todos.length;
  const isLoading = isStreaming && hasInProgress && !allDone;

  return (
    <div>
      <button
        type="button"
        className={cn(
          TOOL_INLINE_ROW_CLASS,
          "text-left text-[length:var(--font-code)] py-0.5",
        )}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <StatusIcon isLoading={isLoading} isError={false} />
        <span className="text-[length:var(--font-chat-meta)] shrink-0 tabular-nums">
          {toolName}
        </span>
        <ListTodoIcon className="size-3.5 shrink-0 text-plan" />
        <span className="font-medium text-foreground/90 shrink-0">Task Plan</span>
        <span className="text-muted-foreground/70 text-[length:var(--font-chat-meta)] tabular-nums shrink-0">
          {completed}/{todos.length}
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
          {todos.map((todo, i) => (
            <div key={i} className="flex items-center gap-2 py-1">
              {todo.status === "completed" ? (
                <CheckIcon className="size-3.5 text-success shrink-0" />
              ) : todo.status === "in_progress" && isStreaming ? (
                <Loader2Icon className="size-3.5 animate-spin text-info shrink-0" />
              ) : todo.status === "in_progress" ? (
                <CircleIcon className="size-3.5 text-info shrink-0" />
              ) : (
                <CircleIcon className="size-3.5 text-muted-foreground shrink-0" />
              )}
              <span
                className={cn(
                  "text-[length:var(--font-chat-meta)]",
                  todo.status === "completed" && "line-through text-muted-foreground",
                )}
              >
                {todo.content}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
