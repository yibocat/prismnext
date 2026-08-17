import { useMemo } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { useChatStore } from "@/stores/chat-store";
import {
  extractQuestionPrompt,
  extractQuestionPromptFromBlock,
  mergeQuestionPromptViews,
  type QuestionPromptView,
} from "@/lib/chat/normalize-question-options";

/** Tool input plus Conversation.pendingQuestion (Pi hang). */
export function useQuestionPromptView(
  toolUse: Pick<ContentBlock, "input" | "id"> & { _backfillInput?: unknown },
  enabled: boolean,
): QuestionPromptView {
  const pendingQuestion = useChatStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return tab?.conversation.pendingQuestion ?? null;
  });

  const fromTool = useMemo(
    () => extractQuestionPromptFromBlock(toolUse),
    [toolUse.id, toolUse.input, toolUse._backfillInput],
  );

  const fromPending = useMemo(() => {
    if (!enabled || !pendingQuestion) return null;
    return extractQuestionPrompt({
      question: pendingQuestion.prompt,
      options: pendingQuestion.options,
    });
  }, [enabled, pendingQuestion]);

  return useMemo(
    () => mergeQuestionPromptViews(fromTool, fromPending),
    [fromTool, fromPending],
  );
}
