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
import { StatusIcon, param } from "./shared";

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

  const isMulti = toolUse.input?.multiSelect === true;
  const question = param(toolUse.input, "question") || "";
  const options: string[] = toolUse.input?.options || [];

  // Derived from persistent toolResult — survives tab switches / restart
  const isAlreadyAnswered = hasResult && !isError;
  const persistedAnswer = isAlreadyAnswered ? parseAnswer(toolResult!.content) : "";
  const isPrismQuestion = toolUse.name === "question";
  const needsUserAnswer = !isAlreadyAnswered && (isPrismQuestion || (!isStreaming && toolResult)) && !isError;

  // Reset ephemeral selection when a new question arrives
  useEffect(() => {
    setSelected(new Set());
    setCustomText("");
    setUseCustom(false);
    setSending(false);
  }, [toolUse.id]);

  const selectedLabel = isMulti
    ? [...selected].join(", ")
    : [...selected][0] || customText;
  const answerLabel = isAlreadyAnswered ? persistedAnswer : selectedLabel;

  const hasSelection = isMulti
    ? selected.size > 0
    : selected.size === 1 || (useCustom && customText.trim());

  // ── Handlers ──

  const toggleOption = (opt: string) => {
    if (!needsUserAnswer) return;
    setUseCustom(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (isMulti) {
        next.has(opt) ? next.delete(opt) : next.add(opt);
      } else {
        if (next.has(opt)) { next.clear(); } else { next.clear(); next.add(opt); }
      }
      return next;
    });
  };

  const handleCustomCheck = (checked: boolean | "indeterminate") => {
    if (!needsUserAnswer) return;
    setUseCustom(!!checked);
    if (checked) { setSelected(new Set()); }
    requestAnimationFrame(() => customInputRef.current?.focus());
  };

  const handleSend = () => {
    if (!needsUserAnswer || !hasSelection) return;
    setSending(true);
    const answer = useCustom ? customText.trim() : selectedLabel;
    const tabId = useChatStore.getState().activeTabId;
    const sessionId = useChatStore.getState().tabs.find((t) => t.id === tabId)?.sessionId;
    if (!sessionId) { setSending(false); return; }

    window.electronAPI.chatAnswerQuestion(sessionId, answer).catch(() => {
      setSending(false);
    });
  };

  const handleCancel = () => {
    setSelected(new Set());
    setCustomText("");
    setUseCustom(false);
  };

  // ── Render ──

  // Compact loading / empty-question fallback
  if (!question && !options.length) {
    return (
      <div className="my-2 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-[length:var(--font-code)]">
        <StatusIcon isLoading={!hasResult} isError={!!isError} />
        <span className="text-muted-foreground text-[length:var(--font-chat-meta)] shrink-0">{toolName}</span>
        <MessageCircleQuestionIcon className="size-3.5 text-info" />
        <span className="text-muted-foreground">
          {!hasResult ? "Waiting for question…" : isError ? "Question failed" : "Question asked"}
        </span>
      </div>
    );
  }

  // ── Answered state (collapsible) ──
  if (isAlreadyAnswered) {
    return (
      <div className="my-2 rounded-lg border border-border bg-card overflow-hidden text-[length:var(--font-code)]">
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/50 transition-colors"
          onClick={() => setExpanded(!expanded)}
        >
          <StatusIcon isLoading={false} isError={false} />
          <span className="text-muted-foreground text-[length:var(--font-chat-meta)] shrink-0">{toolName}</span>
          <MessageCircleQuestionIcon className="size-3.5 text-info" />
          <span className="font-medium">Answered</span>
          <span className="text-muted-foreground truncate">
            — {answerLabel.slice(0, 50)}{answerLabel.length > 50 && "…"}
          </span>
          <ChevronDownIcon
            className={cn(
              "ml-auto size-3.5 text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
          />
        </button>
        {expanded && (
          <div className="border-t border-border bg-muted/20 px-3 py-2 text-[length:var(--font-chat-message)] space-y-1.5">
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
    <div className="my-2 rounded-lg border border-border bg-card overflow-hidden text-[length:var(--font-code)]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/20">
        <StatusIcon isLoading={!hasResult} isError={!!isError} />
        <span className="text-muted-foreground text-[length:var(--font-chat-meta)] shrink-0">{toolName}</span>
        <MessageCircleQuestionIcon className="size-3.5 text-info" />
        <span className="font-medium text-foreground/90">Choose an option</span>
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
          {options.map((opt, i) => {
            const isSelected = selected.has(opt);
            return (
              <button
                key={i}
                type="button"
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-all",
                  "hover:bg-muted/50 cursor-pointer",
                  isSelected && "bg-info/8 ring-1 ring-inset ring-info/25",
                )}
                onClick={() => toggleOption(opt)}
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
                <span className={cn("select-none", isSelected ? "text-foreground font-medium" : "text-foreground/80")}>
                  {opt}
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
          )}
          onClick={() => handleCustomCheck(!useCustom)}
        >
          <Checkbox checked={useCustom} className="size-3.5 pointer-events-none" tabIndex={-1} />
          <span className="text-muted-foreground">Other — type your own</span>
        </div>
        {useCustom && (
          <div className="mt-1 ml-8">
            <Input
              ref={customInputRef}
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && hasSelection) handleSend(); }}
              placeholder="Type your answer…"
              className="h-8 text-[length:var(--font-code)]"
            />
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-end gap-1.5 px-3 py-1.5 border-t border-border bg-muted/10">
        <Button type="button" variant="ghost" size="xs" disabled={!hasSelection} onClick={handleCancel}>
          <XIcon className="size-3" />
          Clear
        </Button>
        <Button type="button" size="xs" disabled={!hasSelection || sending} onClick={handleSend}>
          <SendIcon className="size-3" />
          {sending ? "Sending…" : "Send"}
        </Button>
      </div>
    </div>
  );
});
