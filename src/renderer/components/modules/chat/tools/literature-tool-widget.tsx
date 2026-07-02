import { useState, memo } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { BookOpenIcon, CheckCircle2Icon, XCircleIcon } from "lucide-react";
import { ToolCard, param } from "./shared";
import { parseStageToolResult } from "@/lib/literature/parse-stage-tool-result";

const LABELS: Record<string, string> = {
  "literature-read": "Read library paper",
  "literature-read-pdf": "Read paper PDF text",
  "literature-search": "Search literature library",
  "literature-stage": "Stage citation",
  "literature-add": "Add paper to library",
  "literature-cite": "Add paper to .bib",
};

function parseToolJson(content: unknown): Record<string, unknown> | null {
  if (content == null) return null;
  if (typeof content === "object" && !Array.isArray(content)) {
    return content as Record<string, unknown>;
  }
  if (typeof content !== "string") return null;
  try {
    const parsed = JSON.parse(content) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    if (typeof parsed === "string") {
      try {
        const inner = JSON.parse(parsed) as unknown;
        if (typeof inner === "object" && inner !== null && !Array.isArray(inner)) {
          return inner as Record<string, unknown>;
        }
      } catch {
        return null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function LiteratureResultSummary({
  toolName,
  data,
}: {
  toolName: string;
  data: Record<string, unknown>;
}) {
  if (toolName === "literature-stage") {
    const stage = parseStageToolResult(data) ?? parseStageToolResult(JSON.stringify(data));
    if (!stage) return null;
    if (!stage.verified) {
      return (
        <p className="text-[length:var(--font-chat-meta)] text-destructive">
          {stage.error ?? "Could not verify citation."}
        </p>
      );
    }
    const title = stage.citation?.title?.trim() || "Untitled";
    return (
      <div className="space-y-1 text-[length:var(--font-chat-meta)]">
        <p className="flex items-center gap-1.5 text-foreground">
          <CheckCircle2Icon className="size-3.5 shrink-0 text-emerald-600" />
          <span className="font-medium">[{stage.refId}]</span>
          <span className="truncate">{title}</span>
        </p>
        {stage.citation?.doi ? (
          <p className="text-muted-foreground break-all" title={stage.citation.doi}>
            DOI: {stage.citation.doi}
          </p>
        ) : null}
        {stage.citation?.arxivId ? (
          <p className="text-muted-foreground break-all" title={stage.citation.arxivId}>
            arXiv: {stage.citation.arxivId}
          </p>
        ) : null}
        {stage.alreadyInLibrary && stage.libraryBibkey ? (
          <p className="text-muted-foreground">Already in library · {stage.libraryBibkey}</p>
        ) : null}
      </div>
    );
  }

  if (toolName === "literature-read-pdf") {
    if (data.intensiveReadingRequired) {
      return (
        <p className="flex items-start gap-1.5 text-[length:var(--font-chat-meta)] text-destructive">
          <XCircleIcon className="size-3.5 shrink-0 mt-0.5" />
          <span>{String(data.error ?? "Intensive reading required.")}</span>
        </p>
      );
    }
    if (data.error) {
      return (
        <p className="text-[length:var(--font-chat-meta)] text-destructive">{String(data.error)}</p>
      );
    }
    const excerpt =
      typeof data.markdown === "string"
        ? data.markdown
        : typeof data.content === "string"
          ? data.content
          : null;
    const pages = typeof data.pages === "string" ? data.pages : null;
    return (
      <div className="space-y-1 text-[length:var(--font-chat-meta)] text-muted-foreground">
        {pages ? <p>Pages: {pages}</p> : null}
        {excerpt ? (
          <pre className="whitespace-pre-wrap break-words max-h-48 overflow-y-auto font-mono text-[length:var(--font-size-11)]">
            {excerpt.length > 1200 ? `${excerpt.slice(0, 1200)}\n\n···` : excerpt}
          </pre>
        ) : (
          <p>PDF text returned.</p>
        )}
      </div>
    );
  }

  if (toolName === "literature-add" && data.success) {
    const paper = data.paper as { bibkey?: string; title?: string } | undefined;
    return (
      <p className="text-[length:var(--font-chat-meta)] text-muted-foreground">
        {paper?.bibkey ? (
          <>
            Added <span className="font-mono">{paper.bibkey}</span>
            {paper.title ? ` — ${paper.title}` : ""}
          </>
        ) : (
          "Paper added to library."
        )}
      </p>
    );
  }

  if (toolName === "literature-search" && Array.isArray(data.results)) {
    return (
      <p className="text-[length:var(--font-chat-meta)] text-muted-foreground">
        {data.results.length} result{data.results.length === 1 ? "" : "s"}
      </p>
    );
  }

  return null;
}

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
  const pages = param(toolUse.input, "pages");
  const isLoading = !toolResult;
  const isError = toolResult?.is_error;
  const hasContent = toolResult?.content != null;
  const parsed = toolResult?.content != null ? parseToolJson(toolResult.content) : null;

  const detail = bibkey
    ? `bibkey: ${bibkey}${pages ? ` · p.${pages}` : ""}`
    : doi
      ? `doi: ${doi}`
      : arxivId
        ? `arXiv: ${arxivId}`
        : query
          ? `query: ${query.slice(0, 80)}`
          : "";

  return (
    <ToolCard
      toolName={toolName}
      icon={<BookOpenIcon className="size-3.5 text-info" />}
      label={<span className="truncate font-medium">{LABELS[toolName] ?? toolName}</span>}
      meta={detail ? (
        <span
          className="text-muted-foreground/70 shrink-0 truncate text-[length:var(--font-chat-meta)]"
          title={detail}
        >
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
        <>
          {parsed ? (
            <div className="mb-2 font-sans">
              <LiteratureResultSummary toolName={toolName} data={parsed} />
            </div>
          ) : null}
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
        </>
      )}
    </ToolCard>
  );
});
