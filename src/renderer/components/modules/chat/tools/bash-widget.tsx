import { memo, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { ContentBlock } from "@/stores/chat-store";
import { ExternalLinkIcon, TerminalIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Hint } from "@/components/ui/hint";
import { ShikiInlineHighlight } from "../shiki-code-block";
import { ToolCard, param } from "./shared";
import { useToolPermission } from "./use-tool-permission";
import { parseBashResultContent } from "@/lib/terminal/ai-bridge";
import { useExecutionStore } from "@/stores/execution-store";
import { useRightPanelStore } from "@/stores/right-panel-store";

function formatResultPayload(content: unknown, parsedOutput: string): string {
  if (parsedOutput) return parsedOutput;
  if (typeof content === "string") return content;
  if (content == null) return "";
  try {
    return JSON.stringify(content, null, 2);
  } catch {
    return String(content);
  }
}

function asDistinctPhrase(value: unknown, command: string): string {
  if (typeof value !== "string") return "";
  const phrase = value.trim();
  if (!phrase || phrase === command.trim()) return "";
  return phrase;
}

/** First useful token(s) when the model did not say what the command is for. */
function inferBashIntent(command: string): string {
  const one = command.replace(/\s+/g, " ").trim();
  if (!one) return "";
  const withoutEnv = one.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/, "");
  const first = withoutEnv.split(/[|&;]+/)[0]?.trim() ?? "";
  const tokens = first.split(/\s+/).filter((token) => !token.startsWith("-"));
  if (tokens.length === 0) return "";
  const bin = tokens[0].split("/").pop() ?? tokens[0];
  const sub = tokens[1];
  if (sub && /^[a-z][a-z0-9_-]*$/i.test(sub) && bin.length <= 16) {
    return `${bin} ${sub}`;
  }
  if (bin && bin.length <= 24 && /^[\w.-]+$/.test(bin)) return bin;
  return "";
}

function resolveBashIntent(
  input: Record<string, unknown> | undefined,
  title: string | undefined,
  command: string,
): string {
  return (
    asDistinctPhrase(input?.description, command)
    || asDistinctPhrase(title, command)
    || asDistinctPhrase(input?._title, command)
    || inferBashIntent(command)
  );
}

export const BashWidget = memo(function BashWidget({
  toolUse,
  toolResult,
  toolName,
}: {
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
  toolName: string;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const command = param(toolUse.input, "command") || "";
  const intent = resolveBashIntent(
    toolUse.input as Record<string, unknown> | undefined,
    toolUse.title,
    command,
  ) || t("chat.tools.bash.runCommand");
  const isError = toolResult?.is_error;
  const hasContent = toolResult?.content != null;
  const { isAwaitingPermission, isToolDenied } = useToolPermission(
    toolUse.id || "",
    toolName,
  );
  const isDenied = isToolDenied;
  const isLoading = !toolResult && !isAwaitingPermission && !isDenied;

  const parsed = parseBashResultContent(toolResult?.content);
  const exitCode = parsed.exitCode
    ?? (toolResult?.content as any)?.exit_code
    ?? undefined;
  const outputText = formatResultPayload(toolResult?.content, parsed.output);

  useEffect(() => {
    if (isLoading) setExpanded(true);
  }, [isLoading]);

  const handleOpenInTerminal = useCallback(async () => {
    const toolCallId = toolUse.id || "";
    const fromResult = parsed.executionId?.trim();
    const executionId =
      fromResult
      || (toolCallId ? useExecutionStore.getState().findByToolCallId(toolCallId) : undefined)
      || (toolCallId ? await useExecutionStore.getState().resolveByToolCallId(toolCallId) : undefined);
    if (!executionId) {
      toast.info(t("chat.tools.bash.monitorUnavailable"));
      return;
    }
    useRightPanelStore.getState().openJobMonitor(executionId);
  }, [parsed.executionId, t, toolUse.id]);

  let resultText = t("chat.tools.bash.running");
  if (isDenied) resultText = t("chat.tools.bash.denied");
  else if (isAwaitingPermission) resultText = t("chat.tools.bash.confirmAbove");
  else if (hasContent) resultText = outputText.trim() ? outputText : t("chat.tools.bash.noOutput");

  return (
    <ToolCard
      toolName={toolName}
      icon={<TerminalIcon className="size-3.5 text-warning" />}
      label={<span className="truncate">{intent}</span>}
      meta={
        <>
          {isAwaitingPermission && (
            <span className="text-primary shrink-0 text-[length:var(--font-chat-meta)]">
              {t("chat.tools.bash.confirmAbove")}
            </span>
          )}
          {isDenied && (
            <span className="text-destructive shrink-0 text-[length:var(--font-chat-meta)]">
              {t("chat.tools.bash.denied")}
            </span>
          )}
          {exitCode !== undefined && (
            <span className={cn(
              "shrink-0 text-[length:var(--font-chat-meta)] font-mono",
              exitCode === 0 ? "text-success" : "text-destructive",
            )}>
              exit {exitCode}
            </span>
          )}
          <Hint label={t("chat.tools.bash.openMonitorHint")}>
            <button
              type="button"
              className="inline-flex items-center gap-1 shrink-0 text-[length:var(--font-chat-meta)] text-muted-foreground hover:text-foreground transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenInTerminal();
              }}
            >
              <ExternalLinkIcon className="size-3" />
              {t("chat.tools.bash.openMonitor")}
            </button>
          </Hint>
        </>
      }
      expanded={expanded}
      onToggle={() => setExpanded(!expanded)}
      isLoading={isLoading}
      isError={!!isError || isDenied}
      hasContent
    >
      {() => (
        <div
          data-testid="bash-panel"
          className="max-h-72 space-y-1 overflow-y-auto"
        >
          <div
            data-testid="bash-command-scroll"
            className="flex items-start gap-1.5 font-mono"
          >
            <span className="shrink-0 text-muted-foreground">$ </span>
            {command ? (
              <ShikiInlineHighlight code={command} lang="bash" className="min-w-0 flex-1" />
            ) : (
              <span>{t("chat.tools.bash.shellCommand")}</span>
            )}
          </div>
          <pre className="whitespace-pre-wrap break-all font-mono text-muted-foreground">
            {resultText}
          </pre>
        </div>
      )}
    </ToolCard>
  );
});
