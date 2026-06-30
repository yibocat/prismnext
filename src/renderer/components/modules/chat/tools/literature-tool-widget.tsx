import { useState, memo } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { BookOpenIcon } from "lucide-react";
import { ToolCard, param } from "./shared";

const LABELS: Record<string, string> = {
  "literature-read": "Read library paper",
  "literature-search": "Search literature library",
  "literature-stage": "Stage citation",
  "literature-add": "Add paper to library",
  "literature-cite": "Add paper to .bib",
};

export const LiteratureToolWidget = memo(function LiteratureToolWidget({
  toolUse,
  toolResult,
  toolName,
}: {
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
  toolName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const bibkey = param(toolUse.input, "bibkey");
  const query = param(toolUse.input, "query");
  const doi = param(toolUse.input, "doi");
  const arxivId = param(toolUse.input, "arxivId") || param(toolUse.input, "arxiv_id");
  const isLoading = !toolResult;
  const isError = toolResult?.is_error;
  const hasContent = toolResult?.content != null;

  const detail = bibkey
    ? `bibkey: ${bibkey}`
    : doi
      ? `doi: ${doi.slice(0, 80)}`
      : arxivId
        ? `arXiv: ${arxivId.slice(0, 80)}`
        : query
          ? `query: ${query.slice(0, 80)}`
          : "";

  return (
    <ToolCard
      toolName={toolName}
      icon={<BookOpenIcon className="size-3.5 text-info" />}
      label={<span className="truncate font-medium">{LABELS[toolName] ?? toolName}</span>}
      meta={detail ? (
        <span className="text-muted-foreground/70 shrink-0 truncate text-[length:var(--font-chat-meta)]">
          {detail}
        </span>
      ) : undefined}
      expanded={expanded}
      onToggle={() => setExpanded(!expanded)}
      isLoading={isLoading}
      isError={!!isError}
      hasContent={hasContent}
      bodyClassName="font-mono text-muted-foreground max-h-80 overflow-y-auto"
    >
      {() => (
        <pre className="whitespace-pre-wrap break-all">
          {(() => {
            const raw = typeof toolResult!.content === "string"
              ? toolResult!.content
              : JSON.stringify(toolResult!.content, null, 2);
            return raw.length > 4000
              ? raw.slice(0, 4000) + `\n\n··· ${raw.length - 4000} more chars`
              : raw;
          })()}
        </pre>
      )}
    </ToolCard>
  );
});
