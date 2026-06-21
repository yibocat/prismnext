import { useState, memo } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { GlobeIcon, ExternalLinkIcon } from "lucide-react";
import { ToolCard, param } from "./shared";

export const WebFetchWidget = memo(function WebFetchWidget({
  toolUse,
  toolResult,
  toolName,
}: {
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
  toolName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const url = param(toolUse.input, "url") || "";
  const format = param(toolUse.input, "format") || "markdown";
  const isLoading = !toolResult;
  const isError = toolResult?.is_error;
  const hasContent = toolResult?.content != null;

  const outputText = typeof toolResult?.content === "string"
    ? toolResult.content
    : JSON.stringify(toolResult?.content ?? "", null, 2);
  const charCount = outputText.length;

  // Extract domain for display
  let domain = url;
  try { domain = new URL(url).hostname; } catch {}

  return (
    <ToolCard
      toolName={toolName}
      icon={<GlobeIcon className="size-3.5 text-info" />}
      label={<span className="truncate font-medium">{domain}</span>}
      meta={
        <>
          <span className="text-muted-foreground text-[length:var(--font-chat-meta)] shrink-0 hidden sm:inline">
            {format}
          </span>
          {hasContent && (
            <span className="text-muted-foreground text-[length:var(--font-chat-meta)] shrink-0">
              {charCount >= 1000 ? `${(charCount / 1000).toFixed(1)}k` : charCount} chars
            </span>
          )}
        </>
      }
      expanded={expanded}
      onToggle={() => setExpanded(!expanded)}
      isLoading={isLoading}
      isError={!!isError}
      hasContent={hasContent}
      bodyClassName="max-h-80 overflow-y-auto"
    >
      <div className="flex items-center gap-1 text-[length:var(--font-chat-meta)] text-muted-foreground/70 mb-1">
        <span className="truncate">{url}</span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-info hover:text-info/80"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLinkIcon className="size-3" />
        </a>
      </div>
      <pre className="whitespace-pre-wrap break-all font-mono text-muted-foreground">
        {outputText.length > 3000
          ? outputText.slice(0, 3000) + `\n\n··· ${outputText.length - 3000} more chars`
          : outputText}
      </pre>
    </ToolCard>
  );
});
