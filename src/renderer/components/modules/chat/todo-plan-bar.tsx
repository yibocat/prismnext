import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useChatStore } from "@/stores/chat-store";
import {
  resolveMessageTodoPlan,
  selectComposerHostedTodoId,
} from "@/lib/chat/composer-pending-tools";
import { TodoWriteWidget } from "./tools/todo-widget";

/**
 * Task plan drawer under the anchor user message bubble (not composer chrome).
 */
export function MessageTodoDrawer() {
  const { t } = useTranslation();
  const todoId = useChatStore(selectComposerHostedTodoId);
  const streamTick = useChatStore((s) => s.streamTick);
  const dismissEpoch = useChatStore((s) => s.todoPlanDismissEpoch);
  const dismissTodoPlan = useChatStore((s) => s.dismissTodoPlan);

  const pending = useMemo(() => {
    if (!todoId) return null;
    return resolveMessageTodoPlan(useChatStore.getState());
  }, [todoId, streamTick, dismissEpoch]);

  if (!pending) return null;

  return (
    <TodoWriteWidget
      toolUse={pending.toolUse}
      toolName={t("chat.tools.todowrite", { defaultValue: "todowrite" })}
      surface="drawer"
      onDismiss={() => {
        if (pending.toolUse.id) dismissTodoPlan(pending.toolUse.id);
      }}
    />
  );
}
