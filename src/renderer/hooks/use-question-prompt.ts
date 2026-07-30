import { useEffect, useMemo, useState } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { useChatStore } from "@/stores/chat-store";
import {
  extractQuestionPrompt,
  extractQuestionPromptFromBlock,
  mergeQuestionPromptViews,
  type QuestionPromptView,
} from "@/lib/chat/normalize-question-options";

/** Tool input + prism-question bridge file (source of truth while tool is running). */
export function useQuestionPromptView(
  toolUse: Pick<ContentBlock, "input" | "id"> & { _backfillInput?: unknown },
  enabled: boolean,
): QuestionPromptView {
  const sessionId = useChatStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return tab?.sessionId?.trim() || null;
  });

  const fromTool = useMemo(
    () => extractQuestionPromptFromBlock(toolUse),
    [toolUse.id, toolUse.input, toolUse._backfillInput],
  );

  const [fromBridge, setFromBridge] = useState<QuestionPromptView | null>(null);

  useEffect(() => {
    setFromBridge(null);
    if (!enabled || !sessionId) return;

    let cancelled = false;
    const load = async () => {
      try {
        const res = await window.electronAPI.chatReadPendingQuestion(sessionId);
        if (cancelled || !res.ok) return;
        setFromBridge(
          extractQuestionPrompt({
            question: res.question,
            options: res.options,
            multiSelect: res.multiSelect,
          }),
        );
      } catch {
        // Bridge not ready yet — keep polling briefly.
      }
    };

    void load();
    const id = window.setInterval(() => void load(), 400);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled, sessionId, toolUse.id]);

  return useMemo(
    () => mergeQuestionPromptViews(fromTool, fromBridge),
    [fromTool, fromBridge],
  );
}
