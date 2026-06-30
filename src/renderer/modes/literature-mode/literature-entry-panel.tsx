import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  Loader2Icon,
  RefreshCwIcon,
  Trash2Icon,
  ExternalLinkIcon,
  FileDownIcon,
  DownloadIcon,
  BookOpenIcon,
  NotebookPenIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useDocumentStore } from "@/stores/document-store";
import { useLiteratureStore } from "@/stores/literature-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SETTINGS_ROW_DESC } from "@/components/modules/settings/settings-tokens";
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
} from "./literature-inline-field";
import {
  literaturePrimaryActionBtnClass,
  literaturePrimaryActionShellClass,
} from "./literature-list-chrome";
import { cn } from "@/lib/utils";
import { openUrlInBrowser } from "@/lib/browser-link";
import { createNewPaperNote } from "@/lib/literature/create-paper-note";
import { publicationDetailRows } from "./literature-csl-fields";
import { LiteraturePaperNotesSection } from "./literature-paper-notes";
import type { LiteraturePaper } from "@/types/electron.d";

const DETAIL_BADGE_CLASS =
  "inline-flex shrink-0 items-center rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[length:var(--font-size-11)] text-muted-foreground";

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
    </>
  );
}

function EntryPanelActionButton({
  label,
  icon,
  className,
  ...props
}: React.ComponentProps<typeof Button> & { label: string; icon: ReactNode }) {
  return (
    <Button
      size="xs"
      variant="ghost"
      title={label}
      className={cn("h-6 px-1.5 @md:px-2", className)}
      {...props}
    >
      {icon}
      <span className="hidden @md:inline @md:ml-1">{label}</span>
    </Button>
  );
}

export function LiteratureEntryPanel({
  paper,
  fillHeight = false,
}: {
  paper: LiteraturePaper;
  fillHeight?: boolean;
}) {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const updatePaper = useLiteratureStore((s) => s.updatePaper);
  const deletePaper = useLiteratureStore((s) => s.deletePaper);
  const importToLocal = useLiteratureStore((s) => s.importToLocal);
  const fetchMetadata = useLiteratureStore((s) => s.fetchMetadata);
  const downloadPdf = useLiteratureStore((s) => s.downloadPdf);
  const openLiteraturePaper = useRightPanelStore((s) => s.openLiteraturePaper);
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
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [creatingNote, setCreatingNote] = useState(false);

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
    if (!projectRoot) return;
    if (!paper.doi && !paper.arxiv_id) {
      toast.error("Add a DOI or arXiv ID first");
      return;
    }
    setDownloadingPdf(true);
    try {
      await downloadPdf(projectRoot, paper.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "PDF download failed");
    } finally {
      setDownloadingPdf(false);
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

  const handleNewNote = async () => {
    setCreatingNote(true);
    try {
      await createNewPaperNote(paper);
    } finally {
      setCreatingNote(false);
    }
  };

  const handleOpenInZotero = () => {
    if (!paper.zotero_key) return;
    void window.electronAPI.shellOpenExternal(zoteroSelectItemUrl(paper.zotero_key));
  };

  const fieldId = (name: string) => `lit-${paper.id}-${name}`;

  return (
    <div
      className={cn(
        "@container w-full",
        fillHeight
          ? "flex min-h-full flex-col bg-background px-3 py-4 @md:px-6 @md:py-5"
          : "border-t border-border/50 bg-muted/25 px-3 py-3 @md:px-4",
      )}
    >
      <div className={cn("w-full", fillHeight && "flex min-h-full flex-col")}>
        <div className="space-y-4">
          <div className="space-y-2">
            <InlineEditableField
              id={fieldId("title")}
              value={paper.title}
              editable={editable}
              placeholder="Title"
              displayClassName="text-[length:var(--font-size-18)] font-semibold leading-snug text-foreground"
              onSave={async (title) => {
                const trimmed = title.trim();
                if (!trimmed) {
                  toast.error("Title is required");
                  throw new Error("empty");
                }
                await saveField({ title: trimmed });
              }}
            />

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
            </div>
          </div>

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
                rows={2}
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

          <LiteraturePaperNotesSection paper={paper} isZoteroPaper={isZoteroPaper} />
        </div>

        <div className="mt-5 flex items-center gap-1 border-t border-border/40 pt-4">
          {paperHasReadablePdf(paper) ? (
            <button
              type="button"
              onClick={handleOpenPdf}
              className={cn(literaturePrimaryActionShellClass, literaturePrimaryActionBtnClass, "px-1.5 @md:px-2")}
              title="Open PDF in reader"
            >
              <ExternalLinkIcon className="size-3.5 shrink-0" />
              <span className="hidden @md:inline">Open PDF</span>
            </button>
          ) : null}

          <div className="flex-1 min-w-0" />

          <div className="flex flex-wrap items-center justify-end gap-0.5 @md:gap-1">
            <EntryPanelActionButton
              label="New note"
              icon={
                creatingNote ? (
                  <Loader2Icon className="size-3 animate-spin" />
                ) : (
                  <NotebookPenIcon className="size-3" />
                )
              }
              onClick={() => void handleNewNote()}
              disabled={creatingNote || !projectRoot}
            />
            {!isZoteroPaper ? (
              <EntryPanelActionButton
                label="Fetch metadata"
                icon={
                  fetching ? (
                    <Loader2Icon className="size-3 animate-spin" />
                  ) : (
                    <RefreshCwIcon className="size-3" />
                  )
                }
                onClick={() => void handleFetch()}
                disabled={fetching}
              />
            ) : null}
            {!paper.pdf_path && !paper.zotero_key ? (
              <EntryPanelActionButton
                label="Download PDF"
                icon={
                  downloadingPdf ? (
                    <Loader2Icon className="size-3 animate-spin" />
                  ) : (
                    <FileDownIcon className="size-3" />
                  )
                }
                onClick={() => void handleDownloadPdf()}
                disabled={downloadingPdf || (!paper.doi && !paper.arxiv_id)}
              />
            ) : null}
            {isZoteroPaper ? (
              <>
                <EntryPanelActionButton
                  label="Open in Zotero"
                  icon={<BookOpenIcon className="size-3" />}
                  onClick={handleOpenInZotero}
                />
                <EntryPanelActionButton
                  label="Import to local"
                  icon={<DownloadIcon className="size-3" />}
                  onClick={() => projectRoot && void importToLocal(projectRoot, paper.id)}
                  title="Copy this entry into your local library — survives Zotero disconnect"
                />
              </>
            ) : null}
            <EntryPanelActionButton
              label="Delete"
              icon={<Trash2Icon className="size-3" />}
              className="text-muted-foreground hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
            />
          </div>
        </div>
      </div>

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
