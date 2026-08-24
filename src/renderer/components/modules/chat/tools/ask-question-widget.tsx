import { useState, useEffect, useRef, memo } from "react";
import { useTranslation } from "react-i18next";
import type { ContentBlock } from "@/stores/chat-store";
import { agentDesktop } from "@/lib/desktop-api/agent";
import { useChatStore } from "@/stores/chat-store";
import {
  MessageCircleQuestionIcon,
  CircleIcon,
  CheckCircleIcon,
  SendIcon,
  XIcon,
  ChevronDownIcon,
  Loader2Icon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuestionPromptView } from "@/hooks/use-question-prompt";
import {
  TOOL_PANEL_CLASS,
  TOOL_PANEL_HEADER_CLASS,
  TOOL_INLINE_ROW_CLASS,
  TOOL_INLINE_LABEL_CLASS,
  TOOL_EXPANDED_CONTENT_CLASS,
  StatusIcon,
} from "./shared";
import { selectComposerHostedQuestionId } from "@/lib/chat/composer-pending-tools";
import { CHAT_CHROME_BUTTON_TEXT } from "../worktree-selector";
import { ComposerChromeCard } from "../composer-chrome-card";

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

async function writeQuestionAnswer(answer: string, toolUseId?: string): Promise<boolean> {
  const tabId = useChatStore.getState().activeTabId;
  const tab = useChatStore.getState().tabs.find((t) => t.id === tabId);
  const requestId = tab?.conversation.pendingQuestion?.requestId || toolUseId?.trim();
  if (!requestId) return false;
  try {
    const result = await agentDesktop.agentAnswerQuestion({ requestId, answer });
    if (result.ok) {
      useChatStore.getState().acknowledgeQuestionAnswer(requestId, answer);
    }
    return result.ok;
  } catch {
    return false;
  }
}

export const AskUserQuestionWidget = memo(function AskUserQuestionWidget({
  toolUse,
  toolResult,
  toolName,
  surface = "inline",
  hostedInComposer = false,
}: {
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
  toolName: string;
  surface?: "inline" | "composer" | "drawer";
  hostedInComposer?: boolean;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [customText, setCustomText] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [sending, setSending] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [allowOpenText, setAllowOpenText] = useState(false);
  const customInputRef = useRef<HTMLInputElement>(null);

  const isStreaming = useChatStore((s) => s.isStreaming);
  const chromeQuestionId = useChatStore(selectComposerHostedQuestionId);
  const isError = Boolean(toolResult?.is_error);
  const hasResult = toolResult?.content != null;
  const isAlreadyAnswered = hasResult && !isError;
  const isPrismQuestion = (toolUse.name || "").toLowerCase() === "question";
  const needsUserAnswer = Boolean(
    !isAlreadyAnswered && (isPrismQuestion || (!isStreaming && toolResult)) && !isError,
  );

  const { question, options, multiSelect: isMulti } = useQuestionPromptView(
    toolUse,
    needsUserAnswer,
  );

  const isComposer = surface === "composer";
  const waitingForChoices = needsUserAnswer && !question && options.length === 0;

  useEffect(() => {
    setSelected(new Set());
    setCustomText("");
    setUseCustom(false);
    setSending(false);
    setAllowOpenText(false);
  }, [toolUse.id]);

  useEffect(() => {
    if (!needsUserAnswer) return;
    if (options.length > 0) {
      setAllowOpenText(true);
      return;
    }
    const id = window.setTimeout(() => setAllowOpenText(true), 1200);
    return () => window.clearTimeout(id);
  }, [needsUserAnswer, options.length, toolUse.id]);

  useEffect(() => {
    if (!needsUserAnswer || options.length > 0 || !allowOpenText) return;
    setUseCustom(true);
    requestAnimationFrame(() => customInputRef.current?.focus());
  }, [toolUse.id, needsUserAnswer, options.length, allowOpenText]);

  const selectedLabels = options
    .filter((o) => selected.has(o.key))
    .map((o) => o.label);
  const selectedLabel = isMulti
    ? selectedLabels.join(", ")
    : selectedLabels[0] || customText;
  const answerLabel = isAlreadyAnswered ? parseAnswer(toolResult!.content) : selectedLabel;

  const hasSelection = isMulti
    ? selected.size > 0
    : selected.size === 1 || (useCustom && customText.trim().length > 0);

  const toggleOption = (key: string) => {
    if (!needsUserAnswer || sending) return;
    setUseCustom(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (isMulti) {
        next.has(key) ? next.delete(key) : next.add(key);
      } else if (next.has(key)) {
        next.clear();
      } else {
        next.clear();
        next.add(key);
      }
      return next;
    });
  };

  const handleCustomCheck = (checked: boolean | "indeterminate") => {
    if (!needsUserAnswer || sending) return;
    setUseCustom(!!checked);
    if (checked) setSelected(new Set());
    requestAnimationFrame(() => customInputRef.current?.focus());
  };

  const handleSend = async () => {
    if (!needsUserAnswer || !hasSelection || sending) return;
    setSending(true);
    const answer = useCustom ? customText.trim() : selectedLabel;
    const ok = await writeQuestionAnswer(answer, toolUse.id);
    if (!ok) setSending(false);
  };

  const handleCancel = async () => {
    if (!needsUserAnswer || sending) return;
    setSending(true);
    const ok = await writeQuestionAnswer("Cancelled", toolUse.id);
    if (!ok) setSending(false);
  };

  if (!question && !options.length && waitingForChoices) {
    if (isComposer) {
      return (
        <ComposerChromeCard className="flex items-center gap-2 px-3 py-2.5">
          <Loader2Icon className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
          <span className="text-[length:var(--font-chat-meta)] text-muted-foreground">
            {t("chat.questionPanel.loading")}
          </span>
        </ComposerChromeCard>
      );
    }
    return (
      <div className={cn(TOOL_INLINE_ROW_CLASS, "text-[length:var(--font-chat-message)] py-1")}>
        <StatusIcon isLoading />
        <span className="shrink-0 text-muted-foreground/55">{toolName}</span>
        <MessageCircleQuestionIcon className="size-3.5 shrink-0 text-info" />
        <span className="text-muted-foreground truncate">{t("chat.questionPanel.loading")}</span>
      </div>
    );
  }

  if (!question && !options.length) {
    return (
      <div className={cn(TOOL_INLINE_ROW_CLASS, "text-[length:var(--font-chat-message)] py-1")}>
        <StatusIcon isLoading={!hasResult} isError={!!isError} />
        <span className="shrink-0 text-muted-foreground/55">{toolName}</span>
        <MessageCircleQuestionIcon className="size-3.5 shrink-0 text-info" />
        <span className="text-muted-foreground truncate">
          {!hasResult ? t("chat.questionPanel.loading") : isError ? t("chat.questionPanel.failed") : t("chat.questionPanel.asked")}
        </span>
      </div>
    );
  }

  if (!isComposer && needsUserAnswer && (hostedInComposer || toolUse.id === chromeQuestionId)) {
    return null;
  }

  if (!isComposer && needsUserAnswer && chromeQuestionId) {
    return (
      <div className={cn(TOOL_INLINE_ROW_CLASS, "text-[length:var(--font-chat-message)] py-1")}>
        <StatusIcon isLoading={!hasResult} isError={!!isError} />
        <span className="shrink-0 text-muted-foreground/55">{toolName}</span>
        <MessageCircleQuestionIcon className="size-3.5 shrink-0 text-info" />
        <span className="text-muted-foreground truncate">
          {question ? question.slice(0, 72) : t("chat.questionPanel.title")}
          {(question?.length ?? 0) > 72 ? "…" : ""}
        </span>
      </div>
    );
  }

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
            {question ? (
              <>
                <span className="text-[length:var(--font-chat-meta)] text-muted-foreground">{t("chat.questionPanel.questionLabel")}</span>
                <p className="text-foreground">{question}</p>
              </>
            ) : null}
            <span className="text-[length:var(--font-chat-meta)] text-muted-foreground">{t("chat.questionPanel.answerLabel")}</span>
            <p className="font-medium text-foreground">{answerLabel}</p>
          </div>
        )}
      </div>
    );
  }

  if (isComposer) {
    return (
      <ComposerChromeCard className="max-h-[min(36vh,320px)] overflow-y-auto px-3 py-2.5">
        <div className="flex items-start gap-2">
          <MessageCircleQuestionIcon className="mt-0.5 size-3.5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-[length:var(--font-chat-meta)] font-medium text-foreground">
              {t("chat.questionPanel.title")}
            </p>
            {question ? (
              <p className="mt-1 text-[length:var(--font-chat-message)] leading-relaxed text-foreground">
                {question}
              </p>
            ) : null}
            {isMulti ? (
              <p className="mt-1 text-[length:var(--font-chat-meta)] text-muted-foreground">
                {t("chat.questionPanel.multiHint")}
              </p>
            ) : null}
          </div>
        </div>

        {options.length > 0 ? (
          <div className="mt-2.5 flex flex-col gap-1">
            {options.map((opt) => {
              const isSelected = selected.has(opt.key);
              return (
                <button
                  key={opt.key}
                  type="button"
                  disabled={sending}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-md border px-2.5 py-2 text-left transition-colors",
                    isSelected
                      ? "border-primary bg-accent"
                      : "border-border bg-background hover:bg-muted",
                    sending && "pointer-events-none opacity-60",
                  )}
                  onClick={() => toggleOption(opt.key)}
                >
                  {isMulti ? (
                    <Checkbox checked={isSelected} className="mt-0.5 size-3.5 pointer-events-none" tabIndex={-1} />
                  ) : isSelected ? (
                    <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                  ) : (
                    <CircleIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-[length:var(--font-chat-message)]", isSelected && "font-medium")}>
                      {opt.label}
                    </span>
                    {opt.description ? (
                      <span className="mt-0.5 block text-[length:var(--font-chat-meta)] text-muted-foreground">
                        {opt.description}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        {allowOpenText ? (
          <div className="mt-2">
            {options.length > 0 ? (
              <button
                type="button"
                disabled={sending}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors",
                  useCustom ? "border-border bg-muted" : "border-border bg-background hover:bg-muted",
                  sending && "pointer-events-none opacity-60",
                )}
                onClick={() => handleCustomCheck(!useCustom)}
              >
                <Checkbox checked={useCustom} className="size-3.5 pointer-events-none" tabIndex={-1} />
                <span className="text-[length:var(--font-chat-meta)] text-muted-foreground">
                  {t("chat.questionPanel.other")}
                </span>
              </button>
            ) : null}
            {(useCustom || options.length === 0) ? (
              <Input
                ref={customInputRef}
                type="text"
                value={customText}
                disabled={sending}
                onChange={(e) => setCustomText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && hasSelection) void handleSend();
                }}
                placeholder={t("chat.questionPanel.placeholder")}
                className="mt-1.5 h-9 text-[length:var(--font-chat-message)]"
              />
            ) : null}
          </div>
        ) : null}

        <div className="mt-2.5 flex flex-wrap items-center justify-end gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className={cn(CHAT_CHROME_BUTTON_TEXT, "text-muted-foreground")}
            disabled={sending}
            onClick={() => void handleCancel()}
          >
            {t("chat.questionPanel.cancel")}
          </Button>
          <Button
            type="button"
            size="xs"
            className={CHAT_CHROME_BUTTON_TEXT}
            disabled={!hasSelection || sending}
            onClick={() => void handleSend()}
          >
            {sending ? t("chat.questionPanel.sending") : t("chat.questionPanel.send")}
          </Button>
        </div>
      </ComposerChromeCard>
    );
  }

  return (
    <div className={cn("text-[length:var(--font-code)]", TOOL_PANEL_CLASS)}>
      <div className={cn("flex items-center gap-2 px-3 py-2", TOOL_PANEL_HEADER_CLASS)}>
        <StatusIcon isLoading={!hasResult} isError={!!isError} />
        <span className="shrink-0 text-[length:var(--font-chat-meta)] text-muted-foreground">{toolName}</span>
        <MessageCircleQuestionIcon className="size-3.5 text-info" />
        <span className="font-medium text-foreground/90">
          {options.length > 0 ? t("chat.questionPanel.choose") : t("chat.questionPanel.yourAnswer")}
        </span>
      </div>

      {question ? (
        <div className="px-3 pt-2 pb-1">
          <p className="text-[length:var(--font-chat-message)] leading-relaxed text-foreground">{question}</p>
        </div>
      ) : null}

      {options.length > 0 ? (
        <div className="flex flex-col gap-px px-3 py-1.5">
          {options.map((opt) => {
            const isSelected = selected.has(opt.key);
            return (
              <button
                key={opt.key}
                type="button"
                disabled={sending}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-all",
                  "cursor-pointer hover:bg-muted",
                  isSelected && "bg-accent ring-1 ring-inset ring-border",
                  sending && "pointer-events-none opacity-60",
                )}
                onClick={() => toggleOption(opt.key)}
              >
                {isMulti ? (
                  <Checkbox checked={isSelected} className="size-3.5 pointer-events-none" tabIndex={-1} />
                ) : isSelected ? (
                  <CheckCircleIcon className="size-4 shrink-0 text-primary" />
                ) : (
                  <CircleIcon className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1">
                  <span className={cn("block select-none", isSelected ? "font-medium text-foreground" : "text-foreground/80")}>
                    {opt.label}
                  </span>
                  {opt.description ? (
                    <span className="mt-0.5 block text-[length:var(--font-chat-meta)] text-muted-foreground">
                      {opt.description}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {allowOpenText ? (
        <div className="px-3 pb-1.5">
          {options.length > 0 ? (
            <div
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-all hover:bg-muted",
                useCustom && "bg-muted",
                sending && "pointer-events-none opacity-60",
              )}
              onClick={() => handleCustomCheck(!useCustom)}
            >
              <Checkbox checked={useCustom} className="size-3.5 pointer-events-none" tabIndex={-1} />
              <span className="text-muted-foreground">{t("chat.questionPanel.other")}</span>
            </div>
          ) : null}
          {(useCustom || options.length === 0) ? (
            <div className={options.length > 0 ? "mt-1 ml-8" : undefined}>
              <Input
                ref={customInputRef}
                type="text"
                value={customText}
                disabled={sending}
                onChange={(e) => setCustomText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && hasSelection) void handleSend();
                }}
                placeholder={t("chat.questionPanel.placeholder")}
                className="h-8 text-[length:var(--font-code)]"
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={cn("flex items-center justify-end gap-1.5 px-3 py-1.5", TOOL_PANEL_HEADER_CLASS)}>
        <Button type="button" variant="ghost" size="xs" disabled={sending} onClick={() => void handleCancel()}>
          <XIcon className="size-3" />
          {t("chat.questionPanel.cancel")}
        </Button>
        <Button type="button" size="xs" disabled={!hasSelection || sending} onClick={() => void handleSend()}>
          <SendIcon className="size-3" />
          {sending ? t("chat.questionPanel.sending") : t("chat.questionPanel.send")}
        </Button>
      </div>
    </div>
  );
});
