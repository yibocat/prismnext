import { useState, memo } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { BookOpenIcon, CheckCircle2Icon, XCircleIcon } from "lucide-react";
import { ToolCard, param } from "./shared";
import { parseStageToolResult } from "@/lib/literature/parse-stage-tool-result";

const LABELS: Record<string, string> = {
  "literature-read": "Read library paper",
  "literature-read-pdf": "Read paper PDF text",
  "literature-intensive-reading": "Intensive reading",
  "literature-search": "Search literature library",
  "literature-discover": "Discover external papers",
  "literature-stage": "Stage citation",
  "literature-add": "Add paper to library",
  "literature-export-bib": "Export library to .bib",
  "literature-delete": "Delete paper from library",
  "citation-health": "Citation health audit",
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

  if (toolName === "literature-intensive-reading") {
    if (data.error) {
      return (
        <p className="text-[length:var(--font-chat-meta)] text-destructive">{String(data.error)}</p>
      );
    }
    const bibkey = typeof data.bibkey === "string" ? data.bibkey : "";
    const action = typeof data.action === "string" ? data.action : "add";
    const title = typeof data.title === "string" ? data.title : "";
    if (action === "list" && Array.isArray(data.bibkeys)) {
      return (
        <p className="text-[length:var(--font-chat-meta)] text-muted-foreground">
          Intensive list: {data.bibkeys.length === 0 ? "empty" : data.bibkeys.join(", ")}
        </p>
      );
    }
    return (
      <p className="text-[length:var(--font-chat-meta)] text-muted-foreground">
        {action === "remove" ? "Removed from" : "Added to"} intensive reading:{" "}
        {bibkey ? <span className="font-mono">{bibkey}</span> : "paper"}
        {title ? ` — ${title}` : ""}
      </p>
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

  if (toolName === "literature-delete" && data.success) {
    const bibkey = typeof data.bibkey === "string" ? data.bibkey : "";
    const title = typeof data.title === "string" ? data.title : "";
    return (
      <p className="text-[length:var(--font-chat-meta)] text-muted-foreground">
        {bibkey ? (
          <>
            Deleted <span className="font-mono">{bibkey}</span>
            {title ? ` — ${title}` : ""}
          </>
        ) : (
          "Paper removed from library."
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

  if (toolName === "literature-discover" && Array.isArray(data.hits)) {
    const failed = Array.isArray(data.sourcesFailed) ? data.sourcesFailed.length : 0;
    return (
      <p className="text-[length:var(--font-chat-meta)] text-muted-foreground">
        {data.hits.length} hit{data.hits.length === 1 ? "" : "s"}
        {failed > 0 ? ` · ${failed} source${failed === 1 ? "" : "s"} failed` : ""}
      </p>
    );
  }

  if (toolName === "citation-health") {
    const bibCheck =
      data.bibCheck && typeof data.bibCheck === "object"
        ? (data.bibCheck as Record<string, unknown>)
        : null;
    const libraryCheck =
      data.libraryCheck && typeof data.libraryCheck === "object"
        ? (data.libraryCheck as Record<string, unknown>)
        : null;
    const bibMissing = Array.isArray(bibCheck?.missingKeys) ? (bibCheck!.missingKeys as string[]) : [];
    const bibUnused = Array.isArray(bibCheck?.unusedKeys) ? (bibCheck!.unusedKeys as string[]) : [];
    const dupes = Array.isArray(bibCheck?.duplicateKeys) ? (bibCheck!.duplicateKeys as string[]) : [];
    const libMissing = Array.isArray(libraryCheck?.missingKeys) ? (libraryCheck!.missingKeys as string[]) : [];
    const libUnused = Array.isArray(libraryCheck?.unusedKeys) ? (libraryCheck!.unusedKeys as string[]) : [];
    const bibFallback = Array.isArray(data.bibFallback) ? data.bibFallback : [];
    const importable = bibFallback.filter(
      (e) => typeof e === "object" && e && (e as { canImportFromBib?: boolean }).canImportFromBib,
    ).length;
    const notInLib = Array.isArray(data.bibKeysNotInLibrary) ? (data.bibKeysNotInLibrary as string[]) : [];
    const ok = bibMissing.length === 0 && dupes.length === 0 && libMissing.length === 0;
    return (
      <div className="space-y-1 text-[length:var(--font-chat-meta)]">
        <p className="flex items-center gap-1.5">
          {ok ? (
            <CheckCircle2Icon className="size-3.5 shrink-0 text-emerald-600" />
          ) : (
            <XCircleIcon className="size-3.5 shrink-0 text-amber-600" />
          )}
          <span className="text-foreground">
            .bib: {bibMissing.length} missing · {bibUnused.length} unused · {dupes.length} duplicate
          </span>
        </p>
        <p className="text-muted-foreground">
          Library: {libMissing.length} missing · {libUnused.length} unused
        </p>
        {importable > 0 ? (
          <p className="text-muted-foreground">
            {importable} missing key{importable === 1 ? "" : "s"} found in manuscript .bib
          </p>
        ) : null}
        {(() => {
          const unverified = bibFallback.filter(
            (e) => typeof e === "object" && e && (e as { verified?: boolean }).verified === false,
          ).length;
          if (unverified === 0) return null;
          return (
            <p className="text-destructive">
              {unverified} unverified ref{unverified === 1 ? "" : "s"} (suspected fabrication)
            </p>
          );
        })()}
        {notInLib.length > 0 ? (
          <p className="text-muted-foreground">
            {notInLib.length} .bib key{notInLib.length === 1 ? "" : "s"} not in library
          </p>
        ) : null}
        {typeof bibCheck?.bibPath === "string" ? (
          <p className="text-muted-foreground truncate">Bib: {bibCheck.bibPath}</p>
        ) : null}
      </div>
    );
  }

  if (toolName === "literature-export-bib") {
    const appended = Array.isArray(data.appended) ? data.appended : [];
    const skipped = Array.isArray(data.skipped) ? data.skipped : [];
    return (
      <div className="space-y-1 text-[length:var(--font-chat-meta)] text-muted-foreground">
        <p>
          {appended.length} appended · {skipped.length} already in .bib
        </p>
        {typeof data.bibPath === "string" ? (
          <p className="truncate">Bib: {data.bibPath}</p>
        ) : null}
      </div>
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
          className="text-muted-foreground/70 min-w-0 truncate text-[length:var(--font-chat-meta)]"
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
