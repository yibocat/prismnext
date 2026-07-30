import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useChatStore } from "@/stores/chat-store";
import {
  resolveComposerPendingQuestion,
  selectComposerHostedQuestionId,
} from "@/lib/chat/composer-pending-tools";
import { AskUserQuestionWidget } from "./tools/ask-question-widget";

/**
 * Active Question tool — full interactive panel above the composer (PlanChrome pattern).
 */
export function QuestionComposerPanel() {
  const { t } = useTranslation();
  const questionId = useChatStore(selectComposerHostedQuestionId);
  const streamTick = useChatStore((s) => s.streamTick);

  const pending = useMemo(() => {
    if (!questionId) return null;
    return resolveComposerPendingQuestion(useChatStore.getState());
  }, [questionId, streamTick]);

  if (!pending) return null;

  return (
    <AskUserQuestionWidget
      toolUse={pending.toolUse}
      toolResult={pending.toolResult}
      toolName={t("chat.tools.question", { defaultValue: "question" })}
      surface="composer"
    />
  );
}
