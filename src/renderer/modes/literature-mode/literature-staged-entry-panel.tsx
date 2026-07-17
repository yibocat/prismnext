import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2Icon, ExternalLinkIcon, PlusCircleIcon, FolderOpenIcon } from "lucide-react";
import { toast } from "sonner";
import { useCitationStagingStore } from "@/stores/citation-staging-store";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { MetadataRow, literatureIdentifierValueClass, literatureMetadataLinkClass } from "./literature-inline-field";
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
import { stagedAddProgressLabel } from "@/lib/literature/staged-add-progress-label";
import {
  openPaperInMainLibrary,
  openPaperPdfReader,
} from "@/lib/literature/open-paper-in-library";
import { paperHasReadablePdf } from "./literature-format";
import { useLiteratureStore } from "@/stores/literature-store";
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
    tags: [],
    created_at: c.createdAt,
    updated_at: c.createdAt,
  };
}

export function StagedCitationEntryPanel({
  citation,
  inLibrary,
}: {
  citation: StagedCitation;
  inLibrary: boolean;
}) {
  const { t } = useTranslation();
  const addToLibrary = useCitationStagingStore((s) => s.addToLibrary);
  const addProgress = useCitationStagingStore((s) => s.addProgressById[citation.id]);
  const libraryPaper = useLiteratureStore((s) =>
    citation.libraryPaperId
      ? s.papers.find((p) => p.id === citation.libraryPaperId) ?? null
      : null,
  );
  const [adding, setAdding] = useState(false);
  const isAdding = adding || (addProgress != null && addProgress.phase !== "done");
  const progressLabel = addProgress ? stagedAddProgressLabel(addProgress) : null;
  const hasPdf = inLibrary && libraryPaper != null && paperHasReadablePdf(libraryPaper);
  const openTitle = libraryPaper?.title ?? citation.title;

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
    if (!citation.libraryPaperId) return;
    openPaperInMainLibrary(citation.libraryPaperId);
  };

  const handleOpenPdf = () => {
    if (!citation.libraryPaperId || !hasPdf) return;
    openPaperPdfReader(citation.libraryPaperId, openTitle);
  };

  return (
    <div className="@container w-full flex min-h-full flex-col bg-background px-3 py-4 @md:px-6 @md:py-5">
      <div className="w-full flex min-h-full flex-col">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-[length:var(--font-size-18)] font-semibold leading-snug text-foreground">
              {citation.title || t("literature.detail.untitled")}
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
              {inLibrary ? (
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
            <MetadataRow label={t("literature.detail.year")}>
              <span className="text-[length:var(--font-size-13)] text-foreground/90 px-1 -mx-1">
                {citation.year != null ? String(citation.year) : "—"}
              </span>
            </MetadataRow>
            <MetadataRow label={t("literature.detail.publication")}>
              <span className="text-[length:var(--font-size-13)] text-foreground/90 px-1 -mx-1">
                {citation.venue || "—"}
              </span>
            </MetadataRow>
            <MetadataRow label={t("literature.detail.authors")}>
              <span className="text-[length:var(--font-size-13)] text-foreground/90 px-1 -mx-1">
                {authorsDisplay || "—"}
              </span>
            </MetadataRow>
            <MetadataRow label={t("literature.detail.citeKey")}>
              <span className="text-[length:var(--font-size-13)] text-foreground/90 px-1 -mx-1 font-mono">
                {citation.libraryBibkey ?? "—"}
              </span>
            </MetadataRow>
            <MetadataRow label={t("literature.detail.doi")}>
              {doiHref ? (
                <button
                  type="button"
                  className={cn(literatureMetadataLinkClass, literatureIdentifierValueClass, "px-1 -mx-1")}
                  onClick={() => openUrlInBrowser(doiHref)}
                  title={citation.doi ?? undefined}
                >
                  {citation.doi}
                </button>
              ) : (
                <span className="text-[length:var(--font-size-13)] text-muted-foreground px-1 -mx-1">—</span>
              )}
            </MetadataRow>
            <MetadataRow label={t("literature.detail.arxiv")}>
              {arxivHref ? (
                <button
                  type="button"
                  className={cn(literatureMetadataLinkClass, literatureIdentifierValueClass, "px-1 -mx-1")}
                  onClick={() => openUrlInBrowser(arxivHref)}
                  title={citation.arxivId ?? undefined}
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
                  className={cn(literatureMetadataLinkClass, "px-1 -mx-1 break-all")}
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
                    className={cn(literatureMetadataLinkClass, "px-1 -mx-1")}
                    onClick={() => openUrlInBrowser(row.href!)}
                    title={row.value}
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
              <MetadataRow label={t("literature.detail.abstract")}>
                <div className="max-h-40 overflow-y-auto text-[length:var(--font-size-13)] text-foreground/80 px-1 -mx-1 whitespace-pre-wrap">
                  {citation.abstract}
                </div>
              </MetadataRow>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {inLibrary ? (
              <>
                <Hint label="Show this entry in the main Library list">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleOpenInLibrary}
                    disabled={!inLibrary || !citation.libraryPaperId}
                  >
                    <FolderOpenIcon className="size-3.5" />
                    Open in library
                  </Button>
                </Hint>
                {hasPdf ? (
                  <Hint label={t("literature.detail.openPdf")}>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handleOpenPdf}
                    >
                      <ExternalLinkIcon className="size-3.5" />
                      {t("literature.detail.openPdf")}
                    </Button>
                  </Hint>
                ) : null}
              </>
            ) : (
              <Hint
                label={
                  progressLabel ??
                  (!citation.catalogVerified
                    ? t("literature.detail.idNotVerified")
                    : t("literature.detail.addToLibrary"))
                }
              >
                <button
                  type="button"
                  className={cn(literaturePrimaryActionShellClass)}
                  onClick={handleAdd}
                  disabled={isAdding || !citation.catalogVerified}
                >
                  <span className={cn(literaturePrimaryActionBtnClass, "px-2.5")}>
                    {isAdding ? (
                      <Loader2Icon className="size-3.5 animate-spin" />
                    ) : (
                      <PlusCircleIcon className="size-3.5" />
                    )}
                    {isAdding && progressLabel ? progressLabel : t("literature.detail.addToLibrary")}
                  </span>
                </button>
              </Hint>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
