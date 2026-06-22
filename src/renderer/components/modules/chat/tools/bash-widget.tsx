import { useState, memo } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { TerminalIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ToolCard, param } from "./shared";
import { useToolPermission } from "./use-tool-permission";

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

  const exitCode = toolResult?.content?.exitCode
    ?? toolResult?.content?.exit_code
    ?? toolResult?.input?.exitCode
    ?? undefined;

  const showBody = hasContent || isAwaitingPermission || !!command;

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
            const raw = typeof toolResult!.content === "string"
              ? toolResult!.content
              : JSON.stringify(toolResult!.content, null, 2);
            return raw.length > 500
              ? raw.slice(0, 500) + `\n\n··· ${raw.length - 500} more chars`
              : raw;
          })()}
        </>
      )}
    </ToolCard>
  );
});
