import { useState, useEffect, useRef, memo } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { useChatStore } from "@/stores/chat-store";
import {
  MessageCircleQuestionIcon,
  CircleIcon,
  CheckCircleIcon,
  SendIcon,
  XIcon,
  ChevronDownIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  StatusIcon,
  TOOL_PANEL_CLASS,
  TOOL_PANEL_HEADER_CLASS,
  TOOL_INLINE_ROW_CLASS,
  TOOL_INLINE_LABEL_CLASS,
  TOOL_EXPANDED_CONTENT_CLASS,
} from "./shared";
import { extractQuestionPrompt } from "@/lib/chat/normalize-question-options";

/** Extract the human-readable answer string from toolResult.content. */
function parseAnswer(content: unknown): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((c) => (typeof c === "string" ? c : c?.text || "")).join("");
  if (typeof content === "object") {
    const obj = content as Record<string, unknown>;
    return String(obj.output || obj.answer || obj.text || "");
  }
  return String(content);
}

async function writeQuestionAnswer(answer: string): Promise<boolean> {
  const tabId = useChatStore.getState().activeTabId;
  const sessionId = useChatStore.getState().tabs.find((t) => t.id === tabId)?.sessionId;
  if (!sessionId) return false;
  try {
    const result = await window.electronAPI.chatAnswerQuestion(sessionId, answer);
    return !!result?.success;
  } catch {
    return false;
  }
}

export const AskUserQuestionWidget = memo(function AskUserQuestionWidget({
  toolUse,
  toolResult,
  toolName,
}: {
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
  toolName: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [customText, setCustomText] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [sending, setSending] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const customInputRef = useRef<HTMLInputElement>(null);

  const isStreaming = useChatStore((s) => s.isStreaming);
  const isError = toolResult?.is_error;
  const hasResult = toolResult?.content != null;

  const { question, options, multiSelect: isMulti } = extractQuestionPrompt(toolUse.input);

  // Derived from persistent toolResult — survives tab switches / restart
  const isAlreadyAnswered = hasResult && !isError;
  const persistedAnswer = isAlreadyAnswered ? parseAnswer(toolResult!.content) : "";
  const isPrismQuestion = (toolUse.name || "").toLowerCase() === "question";
  const needsUserAnswer = !isAlreadyAnswered && (isPrismQuestion || (!isStreaming && toolResult)) && !isError;

  // Reset ephemeral selection when a new question arrives
  useEffect(() => {
    setSelected(new Set());
    setCustomText("");
    setUseCustom(false);
    setSending(false);
  }, [toolUse.id]);

  // No choices → open Other so the user can type immediately
  useEffect(() => {
    if (!needsUserAnswer || options.length > 0) return;
    setUseCustom(true);
    requestAnimationFrame(() => customInputRef.current?.focus());
  }, [toolUse.id, needsUserAnswer, options.length]);

  const selectedLabels = options
    .filter((o) => selected.has(o.key))
    .map((o) => o.label);
  const selectedLabel = isMulti
    ? selectedLabels.join(", ")
    : selectedLabels[0] || customText;
  const answerLabel = isAlreadyAnswered ? persistedAnswer : selectedLabel;

  const hasSelection = isMulti
    ? selected.size > 0
    : selected.size === 1 || (useCustom && customText.trim().length > 0);

  // ── Handlers ──

  const toggleOption = (key: string) => {
    if (!needsUserAnswer || sending) return;
    setUseCustom(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (isMulti) {
        next.has(key) ? next.delete(key) : next.add(key);
      } else {
        if (next.has(key)) { next.clear(); } else { next.clear(); next.add(key); }
      }
      return next;
    });
  };

  const handleCustomCheck = (checked: boolean | "indeterminate") => {
    if (!needsUserAnswer || sending) return;
    setUseCustom(!!checked);
    if (checked) { setSelected(new Set()); }
    requestAnimationFrame(() => customInputRef.current?.focus());
  };

  const handleSend = async () => {
    if (!needsUserAnswer || !hasSelection || sending) return;
    setSending(true);
    const answer = useCustom ? customText.trim() : selectedLabel;
    const ok = await writeQuestionAnswer(answer);
    if (!ok) setSending(false);
  };

  /** Dismiss the question and unblock the polling tool (writes Cancelled). */
  const handleCancel = async () => {
    if (!needsUserAnswer || sending) return;
    setSending(true);
    const ok = await writeQuestionAnswer("Cancelled");
    if (!ok) setSending(false);
  };

  // ── Render ──

  // Compact loading / empty-question fallback
  if (!question && !options.length) {
    return (
      <div className={cn(TOOL_INLINE_ROW_CLASS, "text-[length:var(--font-chat-message)] py-1")}>
        <StatusIcon isLoading={!hasResult} isError={!!isError} />
        <span className="shrink-0 text-muted-foreground/55">{toolName}</span>
        <MessageCircleQuestionIcon className="size-3.5 shrink-0 text-info" />
        <span className="text-muted-foreground truncate">
          {!hasResult ? "Waiting for question…" : isError ? "Question failed" : "Question asked"}
        </span>
      </div>
    );
  }

  // ── Answered state (collapsible inline row) ──
  if (isAlreadyAnswered) {
    return (
      <div>
        <button
          type="button"
          className={cn(TOOL_INLINE_ROW_CLASS, "text-left text-[length:var(--font-chat-message)] py-1")}
          onClick={() => setExpanded(!expanded)}
        >
          <StatusIcon isLoading={false} isError={false} />
          <span className="shrink-0 text-muted-foreground/55">{toolName}</span>
          <MessageCircleQuestionIcon className="size-3.5 shrink-0 text-info" />
          <span className={TOOL_INLINE_LABEL_CLASS}>
            {answerLabel.slice(0, 80)}{answerLabel.length > 80 && "…"}
          </span>
          <ChevronDownIcon
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
              expanded ? "rotate-0" : "-rotate-90",
            )}
          />
        </button>
        {expanded && (
          <div className={cn(TOOL_EXPANDED_CONTENT_CLASS, "text-[length:var(--font-chat-message)] space-y-1.5")}>
            {question && (
              <>
                <span className="text-[length:var(--font-chat-meta)] text-muted-foreground/70">Question</span>
                <p className="text-foreground">{question}</p>
              </>
            )}
            <span className="text-[length:var(--font-chat-meta)] text-muted-foreground/70">Answer</span>
            <p className="text-foreground font-medium">{answerLabel}</p>
          </div>
        )}
      </div>
    );
  }

  // ── Active (awaiting answer) state ──
  return (
    <div className={cn("text-[length:var(--font-code)]", TOOL_PANEL_CLASS)}>
      {/* Header */}
      <div className={cn("flex items-center gap-2 px-3 py-2", TOOL_PANEL_HEADER_CLASS)}>
        <StatusIcon isLoading={!hasResult} isError={!!isError} />
        <span className="text-muted-foreground text-[length:var(--font-chat-meta)] shrink-0">{toolName}</span>
        <MessageCircleQuestionIcon className="size-3.5 text-info" />
        <span className="font-medium text-foreground/90">
          {options.length > 0 ? "Choose an option" : "Your answer"}
        </span>
        {isMulti && (
          <span className="text-muted-foreground text-[length:var(--font-chat-meta)]">
            ({selected.size > 0 ? `${selected.size} selected` : "multi"})
          </span>
        )}
      </div>

      {/* Question */}
      {question && (
        <div className="px-3 pt-2 pb-1">
          <p className="text-foreground leading-relaxed text-[length:var(--font-chat-message)]">{question}</p>
        </div>
      )}

      {/* Options */}
      {options.length > 0 && (
        <div className="px-3 py-1.5 flex flex-col gap-px">
          {options.map((opt) => {
            const isSelected = selected.has(opt.key);
            return (
              <button
                key={opt.key}
                type="button"
                disabled={sending}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-all",
                  "hover:bg-muted/50 cursor-pointer",
                  isSelected && "bg-info/8 ring-1 ring-inset ring-info/25",
                  sending && "opacity-60 pointer-events-none",
                )}
                onClick={() => toggleOption(opt.key)}
              >
                {isMulti ? (
                  <Checkbox checked={isSelected} className="size-3.5 pointer-events-none" tabIndex={-1} />
                ) : (
                  isSelected ? (
                    <CheckCircleIcon className="size-4 shrink-0 text-info" />
                  ) : (
                    <CircleIcon className="size-4 shrink-0 text-muted-foreground/40" />
                  )
                )}
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block select-none",
                      isSelected ? "text-foreground font-medium" : "text-foreground/80",
                    )}
                  >
                    {opt.label}
                  </span>
                  {opt.description ? (
                    <span className="mt-0.5 block select-none text-[length:var(--font-chat-meta)] text-muted-foreground">
                      {opt.description}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Custom answer */}
      <div className="px-3 pb-1.5">
        <div
          className={cn(
            "flex items-center gap-2 rounded-md px-2 py-1.5 transition-all",
            "hover:bg-muted/50 cursor-pointer",
            useCustom && "bg-muted/20",
            sending && "opacity-60 pointer-events-none",
          )}
          onClick={() => handleCustomCheck(!useCustom)}
        >
          <Checkbox checked={useCustom} className="size-3.5 pointer-events-none" tabIndex={-1} />
          <span className="text-muted-foreground">
            {options.length > 0 ? "Other — type your own" : "Type your answer"}
          </span>
        </div>
        {useCustom && (
          <div className="mt-1 ml-8">
            <Input
              ref={customInputRef}
              type="text"
              value={customText}
              disabled={sending}
              onChange={(e) => setCustomText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && hasSelection) void handleSend(); }}
              placeholder="Type your answer…"
              className="h-8 text-[length:var(--font-code)]"
            />
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className={cn("flex items-center justify-end gap-1.5 px-3 py-1.5", TOOL_PANEL_HEADER_CLASS)}>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={sending}
          onClick={() => void handleCancel()}
        >
          <XIcon className="size-3" />
          Cancel
        </Button>
        <Button
          type="button"
          size="xs"
          disabled={!hasSelection || sending}
          onClick={() => void handleSend()}
        >
          <SendIcon className="size-3" />
          {sending ? "Sending…" : "Send"}
        </Button>
      </div>
    </div>
  );
});
