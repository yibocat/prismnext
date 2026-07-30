import { useState, useEffect, memo } from "react";
import { useTranslation } from "react-i18next";
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
import { ComposerChromeCard } from "../composer-chrome-card";

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
}: {
  toolUse: ContentBlock;
  toolName: string;
  hostedInComposer?: boolean;
  surface?: "inline" | "composer";
}) {
  const { t } = useTranslation();
  const todos: Array<{ content: string; status: string }> = toolUse.input?.todos || [];
  const isStreaming = useChatStore((s) => s.isStreaming);
  const persistKey = toolUse.id || undefined;
  const isComposer = surface === "composer";

  const [expanded, setExpanded] = useState(() => {
    if (isComposer) return true;
    return persistKey ? getTodoExpandedState(persistKey) : false;
  });

  useEffect(() => {
    if (isComposer || !persistKey) return;
    saveTodoExpandedState(persistKey, expanded);
  }, [persistKey, expanded, isComposer]);

  useEffect(() => {
    if (isComposer) setExpanded(true);
  }, [toolUse.id, isComposer]);

  if (todos.length === 0) return null;

  const completed = todos.filter((item) => item.status === "completed").length;
  const hasInProgress = todos.some((item) => item.status === "in_progress");
  const allDone = completed === todos.length;
  const isLoading = isStreaming && hasInProgress && !allDone;
  const title = isComposer ? t("chat.composer.taskPlanTitle") : toolName;

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

  if (isComposer) {
    return (
      <ComposerChromeCard className="px-3 py-2.5">
        <button
          type="button"
          className="flex w-full items-start gap-2 text-left"
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
        {expanded ? (
          <div className="mt-2 border-t border-border pt-2">
            <TodoListItems
              todos={todos}
              isStreaming={isStreaming}
              textClassName="text-[length:var(--font-chat-message)]"
            />
          </div>
        ) : null}
      </ComposerChromeCard>
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
