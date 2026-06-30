import { useMemo, useState } from "react";
import { Loader2Icon, ExternalLinkIcon, PlusCircleIcon, FolderOpenIcon } from "lucide-react";
import { toast } from "sonner";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useCitationStagingStore } from "@/stores/citation-staging-store";
import { Button } from "@/components/ui/button";
import { MetadataRow } from "./literature-inline-field";
import {
  formatEntryType,
  formatLiteratureAuthors,
  formatMetadataSource,
} from "./literature-format";
import { publicationDetailRows } from "./literature-csl-fields";
import {
  literaturePrimaryActionBtnClass,
  literaturePrimaryActionShellClass,
} from "./literature-list-chrome";
import { cn } from "@/lib/utils";
import { openUrlInBrowser } from "@/lib/browser-link";
import type { StagedCitation } from "../../../shared/citation-staging";
import type { LiteraturePaper } from "@/types/electron.d";

const DETAIL_BADGE_CLASS =
  "inline-flex shrink-0 items-center rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[length:var(--font-size-11)] text-muted-foreground";

/** Adapt a StagedCitation into a LiteraturePaper-shaped object for reuse of
 *  csl-field helpers (publicationDetailRows reads paper.csl_json + paper.type). */
function stagedToPaperLike(c: StagedCitation): LiteraturePaper {
  return {
    id: c.id,
    bibkey: c.libraryBibkey ?? `staged-${c.refId}`,
    title: c.title,
    authors: c.authors,
    year: c.year,
    abstract: c.abstract,
    doi: c.doi,
    arxiv_id: c.arxivId,
    isbn: null,
    venue: c.venue,
    type: c.type,
    pdf_path: null,
    pdf_sha: null,
    origin: "catalog",
    metadata_source: c.catalogSource,
    csl_json: c.cslJson ? JSON.stringify(c.cslJson) : null,
    source: null,
    raw_bibtex: null,
    zotero_key: null,
    zotero_version: null,
    zotero_attach_key: null,
    created_at: c.createdAt,
    updated_at: c.createdAt,
  };
}

export function StagedCitationEntryPanel({ citation }: { citation: StagedCitation }) {
  const addToLibrary = useCitationStagingStore((s) => s.addToLibrary);
  const openLiteraturePaper = useRightPanelStore((s) => s.openLiteraturePaper);
  const [adding, setAdding] = useState(false);

  const paperLike = useMemo(() => stagedToPaperLike(citation), [citation]);
  const detailRows = useMemo(() => publicationDetailRows(paperLike), [paperLike]);
  const authorsDisplay = formatLiteratureAuthors(citation.authors);
  const entryTypeLabel = formatEntryType(citation.type);
  const sourceLabel = formatMetadataSource(citation.catalogSource);
  const doiHref = citation.doi ? `https://doi.org/${citation.doi}` : undefined;
  const arxivHref = citation.arxivId ? `https://arxiv.org/abs/${citation.arxivId}` : undefined;

  const handleAdd = async () => {
    setAdding(true);
    try {
      const r = await addToLibrary(citation.id);
      if (r.ok) {
        toast.success(
          r.bibkey ? `Added to library: ${r.bibkey}` : "Added to library",
        );
      } else {
        toast.error(r.error ?? "Failed to add to library");
      }
    } finally {
      setAdding(false);
    }
  };

  const handleOpenInLibrary = () => {
    if (citation.libraryPaperId) {
      openLiteraturePaper(citation.libraryPaperId, citation.title, "grid");
    }
  };

  return (
    <div className="@container w-full flex min-h-full flex-col bg-background px-3 py-4 @md:px-6 @md:py-5">
      <div className="w-full flex min-h-full flex-col">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-[length:var(--font-size-18)] font-semibold leading-snug text-foreground">
              {citation.title || "Untitled"}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {entryTypeLabel ? (
                <span className={DETAIL_BADGE_CLASS} title={citation.type ?? undefined}>
                  {entryTypeLabel}
                </span>
              ) : null}
              {sourceLabel ? (
                <span className={DETAIL_BADGE_CLASS} title="Catalog source">
                  {sourceLabel}
                </span>
              ) : null}
              {citation.catalogVerified ? (
                <span
                  className="inline-flex shrink-0 items-center rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 text-[length:var(--font-size-11)] text-emerald-700 dark:text-emerald-400"
                  title="Identifier verified against external catalog"
                >
                  Verified
                </span>
              ) : citation.verifyError ? (
                <span
                  className="inline-flex shrink-0 items-center rounded-full border border-red-500/35 bg-red-500/10 px-2 py-0.5 text-[length:var(--font-size-11)] text-red-700 dark:text-red-400"
                  title={citation.verifyError}
                >
                  Unverified
                </span>
              ) : null}
              {citation.addedToLibrary ? (
                <span
                  className="inline-flex shrink-0 items-center rounded-full border border-primary/35 bg-primary/10 px-2 py-0.5 text-[length:var(--font-size-11)] text-primary/80"
                  title="Already in project library"
                >
                  In library
                </span>
              ) : null}
            </div>
          </div>

          <div className="space-y-0.5">
            <MetadataRow label="Year">
              <span className="text-[length:var(--font-size-13)] text-foreground/90 px-1 -mx-1">
                {citation.year != null ? String(citation.year) : "—"}
              </span>
            </MetadataRow>
            <MetadataRow label="Publication">
              <span className="text-[length:var(--font-size-13)] text-foreground/90 px-1 -mx-1">
                {citation.venue || "—"}
              </span>
            </MetadataRow>
            <MetadataRow label="Authors">
              <span className="text-[length:var(--font-size-13)] text-foreground/90 px-1 -mx-1">
                {authorsDisplay || "—"}
              </span>
            </MetadataRow>
            <MetadataRow label="Cite key">
              <span className="text-[length:var(--font-size-13)] text-foreground/90 px-1 -mx-1 font-mono">
                {citation.libraryBibkey ?? "—"}
              </span>
            </MetadataRow>
            <MetadataRow label="DOI">
              {doiHref ? (
                <button
                  type="button"
                  className="max-w-full truncate rounded-[3px] px-1 -mx-1 text-left text-[length:var(--font-size-13)] text-foreground/90 hover:underline underline-offset-2"
                  onClick={() => openUrlInBrowser(doiHref)}
                  title={doiHref}
                >
                  {citation.doi}
                </button>
              ) : (
                <span className="text-[length:var(--font-size-13)] text-muted-foreground px-1 -mx-1">—</span>
              )}
            </MetadataRow>
            <MetadataRow label="arXiv">
              {arxivHref ? (
                <button
                  type="button"
                  className="max-w-full truncate rounded-[3px] px-1 -mx-1 text-left text-[length:var(--font-size-13)] text-foreground/90 hover:underline underline-offset-2"
                  onClick={() => openUrlInBrowser(arxivHref)}
                  title={arxivHref}
                >
                  {citation.arxivId}
                </button>
              ) : (
                <span className="text-[length:var(--font-size-13)] text-muted-foreground px-1 -mx-1">—</span>
              )}
            </MetadataRow>
            {citation.sourceUrl ? (
              <MetadataRow label="Source">
                <button
                  type="button"
                  className="max-w-full truncate rounded-[3px] px-1 -mx-1 text-left text-[length:var(--font-size-13)] text-foreground/90 hover:underline underline-offset-2"
                  onClick={() => openUrlInBrowser(citation.sourceUrl!)}
                  title={citation.sourceUrl}
                >
                  <ExternalLinkIcon className="inline size-3 mr-0.5 -mt-0.5" />
                  {citation.sourceUrl}
                </button>
              </MetadataRow>
            ) : null}

            {detailRows.map((row) => (
              <MetadataRow key={row.label} label={row.label}>
                {row.href ? (
                  <button
                    type="button"
                    className="max-w-full truncate rounded-[3px] px-1 -mx-1 text-left text-[length:var(--font-size-13)] text-foreground/90 hover:underline underline-offset-2"
                    onClick={() => openUrlInBrowser(row.href!)}
                    title={row.href}
                  >
                    {row.value}
                  </button>
                ) : (
                  <span className="text-[length:var(--font-size-13)] text-foreground/90 px-1 -mx-1">
                    {row.value}
                  </span>
                )}
              </MetadataRow>
            ))}

            {citation.abstract ? (
              <MetadataRow label="Abstract">
                <div className="max-h-40 overflow-y-auto text-[length:var(--font-size-13)] text-foreground/80 px-1 -mx-1 whitespace-pre-wrap">
                  {citation.abstract}
                </div>
              </MetadataRow>
            ) : null}
          </div>

          <div className="flex items-center gap-2 pt-1">
            {citation.addedToLibrary ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleOpenInLibrary}
                disabled={!citation.libraryPaperId}
              >
                <FolderOpenIcon className="size-3.5" />
                Open in library
              </Button>
            ) : (
              <button
                type="button"
                className={cn(literaturePrimaryActionShellClass)}
                onClick={handleAdd}
                disabled={adding || !citation.catalogVerified}
                title={
                  !citation.catalogVerified
                    ? "Identifier not verified — cannot add"
                    : "Add this paper to the project library"
                }
              >
                <span className={cn(literaturePrimaryActionBtnClass, "px-2.5")}>
                  {adding ? (
                    <Loader2Icon className="size-3.5 animate-spin" />
                  ) : (
                    <PlusCircleIcon className="size-3.5" />
                  )}
                  Add to library
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
