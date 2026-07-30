import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useChatStore } from "@/stores/chat-store";
import {
  resolveComposerPendingTodo,
  selectComposerHostedTodoId,
} from "@/lib/chat/composer-pending-tools";
import { TodoWriteWidget } from "./tools/todo-widget";

/**
 * Latest Task Plan from the active turn — full panel above the composer.
 */
export function TodoPlanBar() {
  const { t } = useTranslation();
  const todoId = useChatStore(selectComposerHostedTodoId);
  const streamTick = useChatStore((s) => s.streamTick);

  const pending = useMemo(() => {
    if (!todoId) return null;
    return resolveComposerPendingTodo(useChatStore.getState());
  }, [todoId, streamTick]);

  if (!pending) return null;

  return (
    <TodoWriteWidget
      toolUse={pending.toolUse}
      toolName={t("chat.tools.todowrite", { defaultValue: "todowrite" })}
      surface="composer"
    />
  );
}
