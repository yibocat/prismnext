import { useState, memo } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { SearchIcon, ExternalLinkIcon } from "lucide-react";
import { openUrlInBrowser } from "@/lib/browser-link";
import { ToolCard, param, parseToolJson } from "./shared";

interface SearchResult {
  title?: string;
  url?: string;
  snippet?: string;
  domain?: string;
}

export const WebSearchWidget = memo(function WebSearchWidget({
  toolUse,
  toolResult,
  toolName,
}: {
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
  toolName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const query = param(toolUse.input, "query") || param(toolUse.input, "search") || "";
  const isLoading = !toolResult;
  const isError = toolResult?.is_error;
  const hasContent = toolResult?.content != null;

  /** Try to parse search results from various formats */
  let results: SearchResult[] = [];
  const raw = parseToolJson(toolResult?.content);
  if (Array.isArray(raw)) {
    results = raw as SearchResult[];
  } else if (raw && typeof raw === "object") {
    const rec = raw as { sources?: SearchResult[]; results?: SearchResult[] };
    if (Array.isArray(rec.sources)) results = rec.sources;
    else if (Array.isArray(rec.results)) results = rec.results;
  }

  const outputText = typeof raw === "string" ? raw : JSON.stringify(raw ?? "", null, 2);

  return (
    <ToolCard
      toolName={toolName}
      icon={<SearchIcon className="size-3.5 text-info" />}
      label={<span className="truncate font-medium">{query.slice(0, 60)}</span>}
      meta={
        results.length > 0 ? (
          <span className="text-muted-foreground/70 shrink-0 text-[length:var(--font-chat-meta)]">
            {results.length} result{results.length !== 1 ? "s" : ""}
          </span>
        ) : undefined
      }
      expanded={expanded}
      onToggle={() => setExpanded(!expanded)}
      isLoading={isLoading}
      isError={!!isError}
      hasContent={hasContent}
      bodyClassName="max-h-96 overflow-y-auto"
    >
      {results.length > 0 ? (
        <div className="space-y-2">
          {results.slice(0, 20).map((r, i) => (
            <div key={i} className="border-b border-border/50 pb-2 last:border-0 last:pb-0">
              <button
                type="button"
                className="text-info hover:text-info/80 font-medium text-[length:var(--font-chat-message)] flex items-center gap-1 text-left"
                onClick={(e) => {
                  e.stopPropagation();
                  if (r.url) openUrlInBrowser(r.url);
                }}
              >
                {r.title || r.url || `Result ${i + 1}`}
                <ExternalLinkIcon className="size-3 shrink-0" />
              </button>
              {r.url && (
                <div className="text-muted-foreground text-[length:var(--font-chat-meta)] truncate">
                  {r.url}
                </div>
              )}
              {r.snippet && (
                <div className="text-muted-foreground mt-0.5 text-[length:var(--font-chat-message)]">
                  {r.snippet.slice(0, 300)}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <pre className="whitespace-pre-wrap break-all font-mono text-muted-foreground">
          {outputText.length > 3000
            ? outputText.slice(0, 3000) + `\n\n··· ${outputText.length - 3000} more chars`
            : outputText}
        </pre>
      )}
    </ToolCard>
  );
});
