import { useCallback, useMemo, useState } from "react";
import {
  ExternalLinkIcon,
  CopyIcon,
  DownloadIcon,
  Loader2Icon,
  MoreHorizontalIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useDocumentStore } from "@/stores/document-store";
import { useLiteratureStore } from "@/stores/literature-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { Button } from "@/components/ui/button";
import {
  AppMenu,
  AppMenuContent,
  AppMenuDestructiveItem,
  AppMenuItem,
  AppMenuSeparator,
  AppMenuTrigger,
} from "@/components/ui/app-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SETTINGS_ROW_DESC } from "@/components/modules/settings/settings-tokens";
import { PAPER_EXTRACT_ACTION_LABEL } from "../../../shared/paper-extract";
import {
  authorsForEditField,
  formatEntryType,
  formatLiteratureAuthors,
  formatPaperProvenance,
  isZoteroSyncedPaper,
  LITERATURE_ENTRY_TYPES,
  paperHasReadablePdf,
  parseAuthorsInput,
  zoteroSelectItemUrl,
} from "./literature-format";
import {
  InlineEditableField,
  InlineEditableSelect,
  MetadataIdValue,
  MetadataRow,
  CopyFeedbackButton,
  literatureMetadataLinkClass,
} from "./literature-inline-field";
import {
  literatureReadActionBtnClass,
  literatureDetailBadgeClass,
} from "./literature-list-chrome";
import { LiteraturePaperUserTags } from "./literature-paper-user-tags";
import {
  LiteraturePdfAttachConflictDialog,
  type LiteraturePdfAttachHandle,
} from "./literature-entry-pdf-attach";
import {
  useLiteraturePdfAttach,
} from "@/lib/literature/use-literature-pdf-attach";
import { cn } from "@/lib/utils";
import { openUrlInBrowser } from "@/lib/browser-link";
import { publicationDetailRows } from "./literature-csl-fields";
import { LiteraturePaperNotesSection } from "./literature-paper-notes";
import { LiteratureAgentTextRow } from "./literature-agent-text";
import type { LiteraturePaper } from "@/types/electron.d";
import {
  isLiteratureAiMetadataConfigured,
  LITERATURE_AI_METADATA_SETUP_HINT,
} from "../../../shared/literature-ai-metadata-model";

const DETAIL_BADGE_CLASS = literatureDetailBadgeClass;

function PublicationDetailsFromCsl({ paper }: { paper: LiteraturePaper }) {
  const rows = useMemo(() => publicationDetailRows(paper), [paper]);
  if (rows.length === 0) return null;

  return (
    <>
      {rows.map((row) => (
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
    </>
  );
}

export function LiteratureEntryPanel({
  paper,
  expandedInLibrary = false,
  pdfAttach: pdfAttachProp,
}: {
  paper: LiteraturePaper;
  /** Expanded in the main library list (full-width detail chrome). */
  expandedInLibrary?: boolean;
  pdfAttach?: LiteraturePdfAttachHandle;
}) {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const settings = useSettingsStore((s) => s.settings);
  const updatePaper = useLiteratureStore((s) => s.updatePaper);
  const deletePaper = useLiteratureStore((s) => s.deletePaper);
  const importToLocal = useLiteratureStore((s) => s.importToLocal);
  const fetchMetadata = useLiteratureStore((s) => s.fetchMetadata);
  const downloadPdf = useLiteratureStore((s) => s.downloadPdf);
  const pdfDownloadProgress = useLiteratureStore((s) => s.pdfDownloadProgress[paper.id]);
  const openLiteraturePaper = useRightPanelStore((s) => s.openLiteraturePaper);
  const internalPdfAttach = useLiteraturePdfAttach(paper.id);
  const pdfAttach = pdfAttachProp ?? internalPdfAttach;
  const pdfCacheState = useLiteratureStore((s) => s.pdfCacheStatus[paper.id]);

  const isZoteroPaper = isZoteroSyncedPaper(paper);
  const editable = !isZoteroPaper;
  const pdfStale = pdfCacheState?.stale ?? false;
  const provenance = formatPaperProvenance(paper);
  const entryTypeLabel = formatEntryType(paper.type);

  const authorsDisplay = formatLiteratureAuthors(paper.authors);
  const doiHref = paper.doi ? `https://doi.org/${paper.doi}` : undefined;
  const arxivHref = paper.arxiv_id ? `https://arxiv.org/abs/${paper.arxiv_id}` : undefined;

  const [fetching, setFetching] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const downloadingPdf = pdfDownloadProgress != null;
  const pdfDownloadLabel =
    pdfDownloadProgress?.phase === "downloading" ? "Downloading PDF…" : "Finding PDF…";
  const canDownloadPdf = !paper.pdf_path && !paper.zotero_key && Boolean(paper.doi || paper.arxiv_id);

  const saveField = useCallback(
    async (patch: Parameters<typeof updatePaper>[2]) => {
      if (!projectRoot) throw new Error("No project open");
      await updatePaper(projectRoot, paper.id, patch, { silent: true });
    },
    [projectRoot, paper.id, updatePaper],
  );

  const handleFetch = async () => {
    if (!projectRoot) return;
    if (!paper.doi && !paper.arxiv_id) {
      toast.error("Add a DOI or arXiv ID first");
      return;
    }
    setFetching(true);
    try {
      await fetchMetadata(projectRoot, paper.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Metadata fetch failed");
    } finally {
      setFetching(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!projectRoot || downloadingPdf) return;
    if (!paper.doi && !paper.arxiv_id) {
      toast.error("Add a DOI or arXiv ID first");
      return;
    }
    try {
      await downloadPdf(projectRoot, paper.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "PDF download failed");
    }
  };

  const handleDelete = async () => {
    if (!projectRoot) return;
    setDeleting(true);
    try {
      await deletePaper(projectRoot, paper.id);
      setDeleteOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const handleOpenPdf = () => {
    if (!paperHasReadablePdf(paper)) return;
    openLiteraturePaper(paper.id, paper.title, "reader");
  };

  const handleOpenInZotero = () => {
    if (!paper.zotero_key) return;
    void window.electronAPI.shellOpenExternal(zoteroSelectItemUrl(paper.zotero_key));
  };

  const aiSummaryActionLabel = paper.ai_summary
    ? "Regenerate summary & keywords"
    : "Generate summary & keywords";

  const handleGenerateAiMetadata = useCallback(() => {
    if (!projectRoot) return;
    if (!isLiteratureAiMetadataConfigured(settings)) {
      toast.error(LITERATURE_AI_METADATA_SETUP_HINT);
      return;
    }
    void window.electronAPI.literatureRegenerateAiMetadata(projectRoot, paper.id);
  }, [paper.id, projectRoot, settings]);

  const fieldId = (name: string) => `lit-${paper.id}-${name}`;

  const entryMainContent = (
    <>
      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <InlineEditableField
              id={fieldId("title")}
              value={paper.title}
              editable={editable}
              placeholder="Title"
              displayClassName="text-[length:var(--font-size-18)] font-semibold leading-7 text-foreground"
              onSave={async (title) => {
                const trimmed = title.trim();
                if (!trimmed) {
                  toast.error("Title is required");
                  throw new Error("empty");
                }
                await saveField({ title: trimmed });
              }}
            />
          </div>
          <div className="flex h-8 shrink-0 items-center gap-0.5 self-start">
            {paperHasReadablePdf(paper) ? (
              <button
                type="button"
                onClick={handleOpenPdf}
                className={cn(literatureReadActionBtnClass, "h-6")}
                title="Read the PDF (human)"
              >
                <ExternalLinkIcon className="size-3.5 shrink-0" />
                <span className="hidden @md:inline">Open PDF</span>
              </button>
            ) : canDownloadPdf ? (
              <button
                type="button"
                onClick={() => void handleDownloadPdf()}
                disabled={downloadingPdf}
                className={cn(literatureReadActionBtnClass, "h-6")}
                title={downloadingPdf ? pdfDownloadLabel : "Download open-access PDF"}
              >
                {downloadingPdf ? (
                  <Loader2Icon className="size-3.5 shrink-0 animate-spin" />
                ) : (
                  <DownloadIcon className="size-3.5 shrink-0" />
                )}
                <span className="hidden @md:inline">
                  {downloadingPdf ? pdfDownloadLabel : "Download PDF"}
                </span>
              </button>
            ) : null}
            <AppMenu>
              <AppMenuTrigger asChild>
                <Button
                  size="xs"
                  variant="ghost"
                  title="More actions"
                  className="size-6 px-0"
                >
                  <MoreHorizontalIcon className="size-3.5" />
                </Button>
              </AppMenuTrigger>
              <AppMenuContent align="end">
                {!isZoteroPaper ? (
                  <AppMenuItem
                    onSelect={() => void handleFetch()}
                    disabled={fetching}
                  >
                    {fetching ? "Fetching metadata…" : "Fetch metadata"}
                  </AppMenuItem>
                ) : null}
                <AppMenuItem onSelect={() => handleGenerateAiMetadata()}>
                  {aiSummaryActionLabel}
                </AppMenuItem>
                {!paper.pdf_path && !paper.zotero_key ? (
                  <AppMenuItem
                    onSelect={() => void handleDownloadPdf()}
                    disabled={downloadingPdf || (!paper.doi && !paper.arxiv_id)}
                  >
                    {downloadingPdf ? pdfDownloadLabel : "Download PDF"}
                  </AppMenuItem>
                ) : null}
                {!paper.pdf_path ? (
                  <AppMenuItem
                    onSelect={() => void pdfAttach.pickAndAttach()}
                    disabled={pdfAttach.busy}
                  >
                    Attach PDF…
                  </AppMenuItem>
                ) : (
                  <AppMenuItem
                    onSelect={() => void pdfAttach.pickAndAttach()}
                    disabled={pdfAttach.busy}
                  >
                    Replace PDF…
                  </AppMenuItem>
                )}
                {isZoteroPaper ? (
                  <>
                    <AppMenuItem onSelect={handleOpenInZotero}>Open in Zotero</AppMenuItem>
                    <AppMenuItem
                      onSelect={() => projectRoot && void importToLocal(projectRoot, paper.id)}
                      title={`Keep metadata and notes in this project without downloading PDF or running ${PAPER_EXTRACT_ACTION_LABEL}`}
                    >
                      Keep in project
                    </AppMenuItem>
                  </>
                ) : null}
                <AppMenuSeparator />
                <AppMenuDestructiveItem onSelect={() => setDeleteOpen(true)}>
                  Delete
                </AppMenuDestructiveItem>
              </AppMenuContent>
            </AppMenu>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {editable ? (
            <InlineEditableSelect
              id={fieldId("type")}
              value={paper.type ?? "article"}
              options={LITERATURE_ENTRY_TYPES}
              editable
              displayClassName={DETAIL_BADGE_CLASS}
              onSave={async (type) => saveField({ type: type || null })}
            />
          ) : entryTypeLabel ? (
            <span className={DETAIL_BADGE_CLASS} title={paper.type ?? undefined}>
              {entryTypeLabel}
            </span>
          ) : null}
          <span className={DETAIL_BADGE_CLASS} title={provenance.secondary}>
            {provenance.primary}
          </span>
          {pdfStale ? (
            <span
              className="inline-flex shrink-0 items-center rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[length:var(--font-size-11)] text-amber-700 dark:text-amber-400"
              title="PDF cache is outdated — refresh from Zotero or reopen the PDF"
            >
              PDF outdated
            </span>
          ) : null}
          <LiteraturePaperUserTags paperId={paper.id} tags={paper.tags ?? []} />
        </div>
      </div>

      {!pdfAttachProp ? <LiteraturePdfAttachConflictDialog attach={pdfAttach} /> : null}

      <div className="space-y-0.5">
        <MetadataRow label="Year">
          <InlineEditableField
            id={fieldId("year")}
            value={paper.year != null ? String(paper.year) : ""}
            editable={editable}
            inputMode="numeric"
            placeholder="Year"
            displayClassName="text-[length:var(--font-size-13)] text-foreground/90"
            onSave={async (raw) => {
              const yearNum = raw.trim() ? Number.parseInt(raw.trim(), 10) : null;
              await saveField({
                year: yearNum != null && Number.isFinite(yearNum) ? yearNum : null,
              });
            }}
          />
        </MetadataRow>

        <MetadataRow label="Publication">
          <InlineEditableField
            id={fieldId("venue")}
            value={paper.venue ?? ""}
            editable={editable}
            placeholder="Journal or conference"
            displayClassName="text-[length:var(--font-size-13)] text-foreground/90"
            onSave={async (venue) => saveField({ venue: venue.trim() || null })}
          />
        </MetadataRow>

        <MetadataRow label="Authors">
          <InlineEditableField
            id={fieldId("authors")}
            value={editable ? authorsForEditField(paper.authors) : authorsDisplay}
            editable={editable}
            multiline
            fitContent
            minRows={1}
            maxRows={12}
            placeholder="John Smith, Jane Doe"
            displayClassName="text-[length:var(--font-size-13)] text-muted-foreground leading-relaxed"
            onSave={async (raw) => saveField({ authors: parseAuthorsInput(raw) })}
          />
        </MetadataRow>

        <PublicationDetailsFromCsl paper={paper} />

        {(editable || paper.bibkey) && (
          <MetadataRow label="Cite key">
            <MetadataIdValue
              value={paper.bibkey ?? ""}
              editable={editable}
              cite
              placeholder="author2024keyword"
              onSave={async (bibkey) => {
                const trimmed = bibkey.trim();
                if (!trimmed) {
                  toast.error("Cite key is required");
                  throw new Error("empty");
                }
                await saveField({ bibkey: trimmed });
              }}
            />
          </MetadataRow>
        )}

        {(editable || paper.doi) && (
          <MetadataRow label="DOI">
            <MetadataIdValue
              value={paper.doi ?? ""}
              editable={editable}
              href={doiHref}
              placeholder="10.…"
              onSave={async (doi) => saveField({ doi: doi.trim() || null })}
            />
          </MetadataRow>
        )}

        {(editable || paper.arxiv_id) && (
          <MetadataRow label="arXiv">
            <MetadataIdValue
              value={paper.arxiv_id ?? ""}
              editable={editable}
              href={arxivHref}
              placeholder="2401.12345"
              onSave={async (arxiv_id) => saveField({ arxiv_id: arxiv_id.trim() || null })}
            />
          </MetadataRow>
        )}

        {(editable || paper.isbn) && (
          <MetadataRow label="ISBN">
            <MetadataIdValue
              value={paper.isbn ?? ""}
              editable={editable}
              placeholder="978-…"
              onSave={async (isbn) => saveField({ isbn: isbn.trim() || null })}
            />
          </MetadataRow>
        )}

        <MetadataRow label="AI Summary" className="items-start">
          {paper.ai_metadata_status === "running" || paper.ai_metadata_status === "queued" ? (
            <span className="text-[length:var(--font-size-13)] italic text-muted-foreground px-1 -mx-1">
              Generating…
            </span>
          ) : paper.ai_summary ? (
            <div className="inline-flex max-w-full min-w-0 items-start gap-1 px-1 -mx-1">
              <p
                className="min-w-0 max-w-full text-[length:var(--font-size-13)] italic leading-relaxed text-muted-foreground"
                title={paper.ai_summary}
              >
                {paper.ai_summary}
              </p>
              <CopyFeedbackButton
                onCopy={() => {
                  void navigator.clipboard.writeText(paper.ai_summary!).catch(() => {
                    toast.error("Could not copy summary");
                  });
                }}
                title="Copy summary"
                className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/45 hover:bg-muted hover:text-foreground transition-colors"
              >
                <CopyIcon className="size-3" />
              </CopyFeedbackButton>
            </div>
          ) : paper.ai_metadata_status === "failed" ? (
            <div className="flex flex-col items-start gap-1.5 px-1 -mx-1">
              <p
                className={cn(SETTINGS_ROW_DESC, "text-destructive/80")}
                title={paper.ai_metadata_error ?? undefined}
              >
                Summary generation failed
              </p>
              <button
                type="button"
                className={cn(literatureReadActionBtnClass, "h-6 px-2")}
                onClick={() => handleGenerateAiMetadata()}
              >
                Try again
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={cn(literatureReadActionBtnClass, "h-6 px-2")}
              onClick={() => handleGenerateAiMetadata()}
            >
              Generate summary & keywords
            </button>
          )}
        </MetadataRow>

        <MetadataRow label="Abstract" className="items-start">
          {editable ? (
            <InlineEditableField
              id={fieldId("abstract")}
              value={paper.abstract ?? ""}
              editable
              multiline
              fitContent
              minRows={3}
              placeholder="Abstract"
              displayClassName="text-[length:var(--font-size-13)] leading-relaxed text-foreground/85 whitespace-pre-wrap"
              onSave={async (abstract) => saveField({ abstract: abstract.trim() || null })}
            />
          ) : paper.abstract ? (
            <p className="text-[length:var(--font-size-13)] leading-relaxed text-foreground/85 whitespace-pre-wrap px-1 -mx-1">
              {paper.abstract}
            </p>
          ) : (
            <p className={cn(SETTINGS_ROW_DESC, "px-1 -mx-1")}>No abstract in Zotero.</p>
          )}
        </MetadataRow>
      </div>

      <LiteratureAgentTextRow paper={paper} />

      <LiteraturePaperNotesSection
        paper={paper}
        isZoteroPaper={isZoteroPaper}
        showSectionDivider={expandedInLibrary}
      />
    </>
  );

  return (
    <div
      className={cn(
        "@container w-full",
        expandedInLibrary
          ? "bg-background px-3 py-4 @md:px-6 @md:py-5"
          : "border-t border-border/50 bg-muted/25 px-3 py-3 @md:px-4",
      )}
    >
      <div className="space-y-4 pb-4">{entryMainContent}</div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete entry?</DialogTitle>
          </DialogHeader>
          <p className={SETTINGS_ROW_DESC}>
            {isZoteroPaper
              ? `"${paper.title}" will be removed from this Prism library only (not deleted from Zotero).`
              : `"${paper.title}" will be removed from the library.`}
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => void handleDelete()}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
