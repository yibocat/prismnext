import { useState, memo } from "react";
import { useTranslation } from "react-i18next";
import type { ContentBlock } from "@/stores/chat-store";
import { useChatStore } from "@/stores/chat-store";
import {
  ListTodoIcon,
  CheckIcon,
  CircleIcon,
  Loader2Icon,
  ChevronDownIcon,
  XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TOOL_INLINE_ROW_CLASS,
  TOOL_EXPANDED_CONTENT_CLASS,
  StatusIcon,
} from "./shared";

function TodoStatusIcon({
  status,
  isStreaming,
}: {
  status: string;
  isStreaming: boolean;
}) {
  if (status === "completed") {
    return <CheckIcon className="size-3.5 shrink-0 text-success" />;
  }
  if (status === "in_progress" && isStreaming) {
    return <Loader2Icon className="size-3.5 shrink-0 animate-spin text-info" />;
  }
  if (status === "in_progress") {
    return <CircleIcon className="size-3.5 shrink-0 text-info" />;
  }
  return <CircleIcon className="size-3.5 shrink-0 text-muted-foreground" />;
}

function TodoListItems({
  todos,
  isStreaming,
  textClassName,
}: {
  todos: Array<{ content: string; status: string }>;
  isStreaming: boolean;
  textClassName: string;
}) {
  return (
    <>
      {todos.map((todo, i) => (
        <div key={i} className="flex items-start gap-2 py-1">
          <span className="mt-0.5 shrink-0">
            <TodoStatusIcon status={todo.status} isStreaming={isStreaming} />
          </span>
          <span
            className={cn(
              textClassName,
              "min-w-0 flex-1 leading-relaxed",
              todo.status === "completed" && "line-through text-muted-foreground",
              todo.status === "in_progress" && !isStreaming && "text-foreground",
            )}
          >
            {todo.content}
          </span>
        </div>
      ))}
    </>
  );
}

export const TodoWriteWidget = memo(function TodoWriteWidget({
  toolUse,
  toolName,
  hostedInComposer = false,
  surface = "inline",
  onDismiss,
}: {
  toolUse: ContentBlock;
  toolName: string;
  hostedInComposer?: boolean;
  /** `drawer` = under user bubble; `composer` kept for compat (same chrome as drawer). */
  surface?: "inline" | "composer" | "drawer";
  onDismiss?: () => void;
}) {
  const { t } = useTranslation();
  const todos: Array<{ content: string; status: string }> = toolUse.input?.todos || [];
  const isStreaming = useChatStore((s) => s.isStreaming);
  const isDrawer = surface === "drawer" || surface === "composer";

  // Always start collapsed (drawer, inline, session reopen). User toggles only.
  const [expanded, setExpanded] = useState(false);

  if (todos.length === 0) return null;

  const completed = todos.filter((item) => item.status === "completed").length;
  const hasInProgress = todos.some((item) => item.status === "in_progress");
  const allDone = completed === todos.length;
  const isLoading = isStreaming && hasInProgress && !allDone;
  const title = isDrawer ? t("chat.composer.taskPlanTitle") : toolName;

  if (hostedInComposer) {
    return (
      <div className={cn(TOOL_INLINE_ROW_CLASS, "py-1 text-[length:var(--font-chat-message)]")}>
        <StatusIcon isLoading={isLoading} isError={false} />
        <span className="shrink-0 tabular-nums text-muted-foreground/55">{toolName}</span>
        <ListTodoIcon className="size-3.5 shrink-0 text-plan" />
        <span className="shrink-0 text-muted-foreground/70">{t("chat.composer.taskPlanTitle")}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground/55">
          {completed}/{todos.length}
        </span>
      </div>
    );
  }

  if (isDrawer) {
    return (
      // Flush under bubble; fill/border match AI-reply tool expand (TOOL_EXPANDED_CONTENT_CLASS).
      <div
        className={cn(
          TOOL_EXPANDED_CONTENT_CLASS,
          "mx-3 my-0 rounded-b-md rounded-t-none border-t-0 animate-none",
        )}
      >
        <div className="flex items-start gap-1.5">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-start gap-2 text-left"
            onClick={() => setExpanded((prev) => !prev)}
          >
            <ListTodoIcon className="mt-0.5 size-3.5 shrink-0 text-plan" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-[length:var(--font-chat-meta)] font-medium text-foreground">
                  {title}
                </span>
                <span className="text-[length:var(--font-chat-meta)] tabular-nums text-muted-foreground">
                  ({completed}/{todos.length})
                </span>
                {isLoading ? (
                  <span className="inline-flex items-center gap-1 text-[length:var(--font-chat-meta)] text-muted-foreground">
                    <Loader2Icon className="size-3 shrink-0 animate-spin" />
                    {t("chat.composer.taskPlanInProgress")}
                  </span>
                ) : null}
              </div>
            </div>
            <ChevronDownIcon
              className={cn(
                "mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
                expanded ? "rotate-0" : "-rotate-90",
              )}
            />
          </button>
          {onDismiss ? (
            <button
              type="button"
              // No mt-0.5: p-0.5 already matches the ListTodo/Chevron optical offset.
              className="rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={t("chat.composer.taskPlanDismiss")}
              title={t("chat.composer.taskPlanDismiss")}
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
            >
              <XIcon className="size-3.5" />
            </button>
          ) : null}
        </div>
        {expanded ? (
          <div className="mt-2 border-t border-border pt-2">
            <TodoListItems
              todos={todos}
              isStreaming={isStreaming}
              textClassName="text-[length:var(--font-chat-message)]"
            />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        className={cn(
          TOOL_INLINE_ROW_CLASS,
          "py-1 text-left text-[length:var(--font-chat-message)]",
        )}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <StatusIcon isLoading={isLoading} isError={false} />
        <span className="shrink-0 tabular-nums text-muted-foreground/55">
          {toolName}
        </span>
        <ListTodoIcon className="size-3.5 shrink-0 text-plan" />
        <span className="shrink-0 text-muted-foreground/70">{t("chat.composer.taskPlanTitle")}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground/55">
          {completed}/{todos.length}
        </span>
        <ChevronDownIcon
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
            expanded ? "rotate-0" : "-rotate-90",
          )}
        />
      </button>
      {expanded ? (
        <div className={cn(TOOL_EXPANDED_CONTENT_CLASS, "py-1.5")}>
          <TodoListItems
            todos={todos}
            isStreaming={isStreaming}
            textClassName="text-[length:var(--font-chat-meta)]"
          />
        </div>
      ) : null}
    </div>
  );
});
