import { useState, useEffect, memo } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { useChatStore } from "@/stores/chat-store";
import { MessageCircleQuestionIcon, CircleIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusIcon } from "./shared";

export const AskUserQuestionWidget = memo(function AskUserQuestionWidget({
  toolUse,
  toolResult,
}: {
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
}) {
  const [answered, setAnswered] = useState(false);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const isLoading = !toolResult;
  const isError = toolResult?.is_error;

  useEffect(() => { setAnswered(false); }, [toolUse.id]);

  const needsUserAnswer = !answered && !isStreaming && toolResult && !isError;

  const question = toolUse.input?.question || "";
  const options: string[] = toolUse.input?.options || [];

  const handleSelectOption = (label: string) => {
    if (!needsUserAnswer) return;
    setAnswered(true);
    const tabId = useChatStore.getState().activeTabId;
    window.electronAPI.cliAnswer(tabId, label).catch(() => {
      setAnswered(false);
    });
  };

  if (!question && !options.length) {
    return (
      <div className="my-2 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-[length:var(--font-code)]">
        <StatusIcon isLoading={isLoading} isError={!!isError} />
        <MessageCircleQuestionIcon className="size-3.5 text-blue-500" />
        <span className="font-medium">{isLoading ? "Asking question..." : "Asked question"}</span>
      </div>
    );
  }

  return (
    <div className={cn(
      "my-2 rounded-lg border px-4 py-3 text-[length:var(--font-code)] transition-colors",
      needsUserAnswer ? "border-blue-500/40 bg-blue-500/5" : "border-blue-500/20 bg-blue-500/[0.02]",
    )}>
      <div className="flex items-center gap-2 mb-2">
        <MessageCircleQuestionIcon className="size-3.5 text-blue-500" />
        <span className="font-medium text-blue-600 dark:text-blue-400">
          {needsUserAnswer ? "Choose an option:" : answered ? "Answer sent" : "Question answered"}
        </span>
      </div>
      {question && <p className="mb-2 text-foreground">{question}</p>}
      <div className="flex flex-col gap-1">
        {options.map((opt, i) => (
          <button
            key={i}
            type="button"
            disabled={!needsUserAnswer}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-left text-[length:var(--font-code)] transition-colors",
              needsUserAnswer && "hover:bg-blue-500/10 cursor-pointer",
              !needsUserAnswer && "cursor-default opacity-60",
            )}
            onClick={() => handleSelectOption(opt)}
          >
            <CircleIcon className="size-2.5 shrink-0 text-muted-foreground" />
            <span>{opt}</span>
          </button>
        ))}
      </div>
    </div>
  );
});
