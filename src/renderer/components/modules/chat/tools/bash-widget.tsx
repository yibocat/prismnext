import { useState, memo, useCallback } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { TerminalIcon, ExternalLinkIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ToolCard, param } from "./shared";
import { useToolPermission } from "./use-tool-permission";
import { parseBashResultContent } from "@/lib/terminal/ai-bridge";
import { useTerminalAiStore } from "@/stores/terminal-ai-store";
import { useChatStore } from "@/stores/chat-store";

export const BashWidget = memo(function BashWidget({
  toolUse,
  toolResult,
  toolName,
}: {
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
  toolName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const chatTabId = useChatStore((s) => s.activeTabId);
  const command = param(toolUse.input, "command")
    || (toolUse.input as any)?._title
    || toolUse.title
    || "";
  const isError = toolResult?.is_error;
  const hasContent = toolResult?.content != null;
  const { isAwaitingPermission, isToolDenied } = useToolPermission(
    toolUse.id || "",
    toolName,
  );
  const isDenied = isToolDenied;
  const isLoading = !toolResult && !isAwaitingPermission && !isDenied;
  const bashState = useTerminalAiStore((s) =>
    toolUse.id ? s.bashByToolCall[toolUse.id] : undefined,
  );
  const isRunning = isLoading || bashState?.status === "running";

  const parsed = parseBashResultContent(toolResult?.content);
  const exitCode = parsed.exitCode
    ?? (toolResult?.content as any)?.exit_code
    ?? undefined;
  const outputText = parsed.output;

  const showBody = hasContent || isAwaitingPermission || !!command;

  const handleOpenInTerminal = useCallback(() => {
    const toolCallId = toolUse.id || "";
    if (!chatTabId || !toolCallId) return;

    if (isRunning) {
      useTerminalAiStore.getState().focusLiveAiTerminal(chatTabId, toolCallId);
      return;
    }

    useTerminalAiStore.getState().openBashInTerminal({
      chatTabId,
      toolCallId,
      command: command || "shell",
      cwd: param(toolUse.input, "workdir") || param(toolUse.input, "cwd"),
      output: outputText,
      exitCode,
      isError: !!isError,
      isDenied,
    });
  }, [chatTabId, toolUse.id, command, toolUse.input, outputText, exitCode, isError, isDenied, isRunning]);

  return (
    <ToolCard
      toolName={toolName}
      icon={<TerminalIcon className="size-3.5 text-warning" />}
      label={<span className="truncate font-mono">{command.slice(0, 80) || "shell command"}</span>}
      meta={
        <>
          {isAwaitingPermission && (
            <span className="text-primary shrink-0 text-[length:var(--font-chat-meta)]">
              Awaiting permission
            </span>
          )}
          {isDenied && (
            <span className="text-destructive shrink-0 text-[length:var(--font-chat-meta)]">
              Denied
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
          <button
            type="button"
            className="inline-flex items-center gap-1 shrink-0 text-[length:var(--font-chat-meta)] text-muted-foreground hover:text-foreground transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenInTerminal();
            }}
            title="Open in AI Terminal"
          >
            <ExternalLinkIcon className="size-3" />
            Terminal
          </button>
        </>
      }
      expanded={expanded}
      onToggle={() => setExpanded(!expanded)}
      isLoading={isLoading}
      isError={!!isError || isDenied}
      hasContent={showBody}
      bodyClassName="font-mono whitespace-pre-wrap break-all"
    >
      {() => (
        <>
          {isAwaitingPermission && command ? (
            <pre className="rounded border border-border bg-muted/40 px-2 py-1.5 text-[length:var(--font-code)] whitespace-pre-wrap break-all mb-2">
              {command}
            </pre>
          ) : null}
          {hasContent && (() => {
            const raw = outputText || (typeof toolResult!.content === "string"
              ? toolResult!.content
              : JSON.stringify(toolResult!.content, null, 2));
            return raw.length > 500
              ? raw.slice(0, 500) + `\n\n··· ${raw.length - 500} more chars`
              : raw;
          })()}
        </>
      )}
    </ToolCard>
  );
});
