import { useState, memo } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { FileTextIcon } from "lucide-react";
import { ToolCard, param, parseToolJson } from "./shared";
import { ChatFileLink } from "../chat-file-link";

function formatCharCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export const DocumentReadWidget = memo(function DocumentReadWidget({
  toolUse,
  toolResult,
  toolName,
}: {
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
  toolName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const filePath = param(toolUse.input, "path") || "";
  const fileName = filePath.split(/[/\\]/).pop() || filePath;
  const isLoading = !toolResult;
  const isError = toolResult?.is_error;
  const hasContent = toolResult?.content != null;

  const parsed = parseToolJson(toolResult?.content);
  const rec = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : null;
  const format = (typeof rec?.format === "string" && rec.format) || "";
  const outputText = typeof rec?.content === "string"
    ? rec.content
    : typeof parsed === "string"
      ? parsed
      : JSON.stringify(parsed ?? "", null, 2);
  const charCount = outputText.length;
  const errorMessage = rec && rec.ok === false && typeof rec.message === "string"
    ? rec.message
    : "";

  return (
    <ToolCard
      toolName={toolName}
      icon={<FileTextIcon className="size-3.5 text-info" />}
      label={filePath
        ? <ChatFileLink path={filePath} />
        : <span className="truncate font-medium">{fileName || "document"}</span>}
      meta={
        <>
          {format ? (
            <span className="text-muted-foreground text-[length:var(--font-chat-meta)] shrink-0 hidden sm:inline">
              {format}
            </span>
          ) : null}
          {hasContent && !isError ? (
            <span className="text-muted-foreground text-[length:var(--font-chat-meta)] shrink-0">
              {formatCharCount(charCount)} chars
            </span>
          ) : null}
        </>
      }
      expanded={expanded}
      onToggle={() => setExpanded(!expanded)}
      isLoading={isLoading}
      isError={!!isError}
      hasContent={hasContent}
      bodyClassName="max-h-80 overflow-y-auto"
    >
      {() => (
        <>
          {filePath ? (
            <div className="text-[length:var(--font-chat-meta)] text-muted-foreground/70 mb-1">
              <ChatFileLink path={filePath} className="font-normal" />
            </div>
          ) : null}
          {errorMessage ? (
            <p className="text-destructive text-[length:var(--font-chat-meta)] mb-1">{errorMessage}</p>
          ) : null}
          <pre className="whitespace-pre-wrap break-all font-mono text-muted-foreground">
            {outputText.length > 3000
              ? outputText.slice(0, 3000) + `\n\n··· ${outputText.length - 3000} more chars`
              : outputText}
          </pre>
        </>
      )}
    </ToolCard>
  );
});
