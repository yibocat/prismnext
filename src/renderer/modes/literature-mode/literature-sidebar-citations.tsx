import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BookPlusIcon,
  ExternalLinkIcon,
  Loader2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { useDocumentStore } from "@/stores/document-store";
import { useLiteratureStore } from "@/stores/literature-store";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";
import {
  buildLibraryIdentityIndex,
  findLibraryPaperInIdentityIndex,
} from "../../../shared/staged-citation-library-match";
import {
  PAPER_CITATION_UI_MAX_ROWS,
  type PaperCitationEntry,
  type PaperCitationNetworkResult,
  type PaperCitationSectionKind,
  describePaperCitationIdentifier,
  paperCitationSourceLabel,
} from "../../../shared/paper-citation-network";
import type { LiteraturePaper, PaperCitationSection } from "@/types/electron.d";
import { openUrlInBrowser } from "@/lib/browser-link/open-in-browser";
import { openPaperInMainLibrary, openPaperPdfReader } from "@/lib/literature/open-paper-in-library";
import { paperHasReadablePdf } from "./literature-format";
import { useLiteratureCitationNetwork } from "./use-literature-citation-network";

const headerBtn = cn(
  "flex size-5 items-center justify-center rounded text-muted-foreground",
  "hover:bg-accent hover:text-accent-foreground transition-colors",
);

const ROW_BASE =
  "flex w-full flex-col gap-1 rounded-sm px-2 py-1.5 text-left text-[length:var(--font-size-12)] transition-colors";

function formatCitationCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (count >= 10_000) return `${Math.round(count / 1000)}k`;
  if (count >= 1_000) return count.toLocaleString();
  return String(count);
}

function CitationMetaLine({ entry }: { entry: PaperCitationEntry }) {
  const parts: string[] = [];
  if (entry.authors?.trim()) parts.push(entry.authors.trim());
  if (entry.year != null) parts.push(String(entry.year));
  if (entry.venue?.trim()) parts.push(entry.venue.trim());
  if (parts.length === 0) return null;
  return (
    <span className="text-[length:var(--font-size-11)] leading-snug text-muted-foreground/75">
      {parts.join(" · ")}
    </span>
  );
}

function CitationRow({
  entry,
  libraryPaperId,
  expanded,
  adding,
  onToggle,
  onOpenInLibrary,
  onAddToLibrary,
}: {
  entry: PaperCitationEntry;
  libraryPaperId: string | null;
  expanded: boolean;
  adding: boolean;
  onToggle: () => void;
  onOpenInLibrary: (paperId: string) => void;
  onAddToLibrary: (entry: PaperCitationEntry) => void;
}) {
  const { t } = useTranslation();
  const externalUrl = entry.doi
    ? `https://doi.org/${entry.doi}`
    : entry.arxivId
      ? `https://arxiv.org/abs/${entry.arxivId}`
      : null;

  const handlePrimaryClick = () => {
    if (libraryPaperId) {
      onOpenInLibrary(libraryPaperId);
      return;
    }
    onToggle();
  };

  return (
    <div className={cn(ROW_BASE, expanded && "bg-accent/40")}>
      <div className="flex w-full items-start gap-1.5">
        <button type="button" className="min-w-0 flex-1 text-left" onClick={handlePrimaryClick}>
          <span className="block text-[length:var(--font-size-12)] leading-snug text-foreground/90">
            {entry.title}
          </span>
          <CitationMetaLine entry={entry} />
          {entry.citedByCount != null && entry.citedByCount > 0 ? (
            <span className="mt-0.5 block text-[length:var(--font-size-10)] text-muted-foreground/55">
              {formatCitationCount(entry.citedByCount)} citations
            </span>
          ) : null}
        </button>
        {libraryPaperId ? (
          <span className="mt-0.5 inline-flex shrink-0 items-center rounded-full border border-primary/35 bg-primary/10 px-1.5 py-0.5 text-[length:var(--font-size-10)] font-medium text-primary/80">
            {t("modes.literature.inLibrary")}
          </span>
        ) : entry.doi || entry.arxivId ? (
          <Hint label={t("modes.literature.addToLibrary")}>
            <button
              type="button"
              className={cn(headerBtn, "mt-0.5 size-6 shrink-0")}
              disabled={adding}
              onClick={() => onAddToLibrary(entry)}
            >
              {adding ? (
                <Loader2Icon className="size-3 animate-spin" />
              ) : (
                <BookPlusIcon className="size-3" />
              )}
            </button>
          </Hint>
        ) : null}
      </div>

      {expanded && !libraryPaperId ? (
        <div className="flex flex-wrap items-center gap-1.5 pl-0.5">
          {(entry.doi || entry.arxivId) && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-6 px-2 text-[length:var(--font-size-10)]"
              disabled={adding}
              onClick={() => onAddToLibrary(entry)}
            >
              Add to library
            </Button>
          )}
          {externalUrl ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-[length:var(--font-size-10)] text-muted-foreground"
              onClick={() => openUrlInBrowser(externalUrl)}
            >
              <ExternalLinkIcon className="size-3" />
              Open online
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CitationListBody({
  kind,
  section,
  result,
  loadingMore,
  identityIndex,
  addingKey,
  expandedKey,
  onToggleExpanded,
  onLoadMore,
  onOpenInLibrary,
  onAddToLibrary,
}: {
  kind: PaperCitationSectionKind;
  section: PaperCitationSection;
  result: PaperCitationNetworkResult;
  loadingMore: boolean;
  identityIndex: ReturnType<typeof buildLibraryIdentityIndex>;
  addingKey: string | null;
  expandedKey: string | null;
  onToggleExpanded: (key: string) => void;
  onLoadMore: () => void;
  onOpenInLibrary: (paperId: string) => void;
  onAddToLibrary: (entry: PaperCitationEntry) => void;
}) {
  const loadedCount = section.items.length;
  const atUiCap = loadedCount >= PAPER_CITATION_UI_MAX_ROWS;
  const showLoadMore = section.hasMore && !atUiCap;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      {kind === "citedBy" && section.totalCount > section.items.length ? (
        <p className="px-2 pt-0.5 text-[length:var(--font-size-10)] text-muted-foreground/50">
          Top citations by impact · {paperCitationSourceLabel(result.source)}
        </p>
      ) : (
        <p className="px-2 pt-0.5 text-[length:var(--font-size-10)] text-muted-foreground/50">
          {paperCitationSourceLabel(result.source)}
        </p>
      )}

      {result.sourceNote ? (
        <p className="px-2 text-[length:var(--font-size-10)] leading-relaxed text-amber-700/85 dark:text-amber-400/85">
          {result.sourceNote}
        </p>
      ) : null}

      {section.items.length === 0 ? (
        <p className="px-2 py-3 text-[length:var(--font-size-11)] text-muted-foreground/55">
          {section.totalCount === 0 ? "None found." : "No entries on this page."}
        </p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {section.items.map((entry) => {
            const linked = findLibraryPaperInIdentityIndex(
              { doi: entry.doi, arxivId: entry.arxivId },
              identityIndex,
            );
            const rowKey = entry.openAlexId || entry.doi || entry.title;
            return (
              <li key={rowKey}>
                <CitationRow
                  entry={entry}
                  libraryPaperId={linked?.id ?? null}
                  expanded={expandedKey === rowKey}
                  adding={addingKey === rowKey}
                  onToggle={() => onToggleExpanded(rowKey)}
                  onOpenInLibrary={onOpenInLibrary}
                  onAddToLibrary={onAddToLibrary}
                />
              </li>
            );
          })}
        </ul>
      )}

      {showLoadMore ? (
        <div className="px-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-full text-[length:var(--font-size-11)]"
            disabled={loadingMore}
            onClick={onLoadMore}
          >
            {loadingMore ? (
              <>
                <Loader2Icon className="mr-1.5 size-3 animate-spin" />
                Loading…
              </>
            ) : (
              "Load more"
            )}
          </Button>
        </div>
      ) : null}

      {atUiCap && section.totalCount > PAPER_CITATION_UI_MAX_ROWS ? (
        <p className="px-2 pb-1 text-[length:var(--font-size-10)] text-muted-foreground/50">
          Showing first {PAPER_CITATION_UI_MAX_ROWS}.
        </p>
      ) : null}
    </div>
  );
}

export function LiteratureSidebarCitationPanel({
  paper,
  section,
  network,
}: {
  paper: LiteraturePaper;
  section: PaperCitationSectionKind;
  network: ReturnType<typeof useLiteratureCitationNetwork>;
}) {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const papers = useLiteratureStore((s) => s.papers);
  const refreshLibrary = useLiteratureStore((s) => s.refresh);

  const { result, loading, loadingMore, loadMore } = network;
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const identityIndex = useMemo(
    () =>
      buildLibraryIdentityIndex(
        papers.map((p) => ({
          id: p.id,
          bibkey: p.bibkey,
          doi: p.doi,
          arxiv_id: p.arxiv_id,
        })),
      ),
    [papers],
  );

  const hasIdentifier = Boolean(paper.doi?.trim() || paper.arxiv_id?.trim());
  const identifierLabel = describePaperCitationIdentifier(paper);
  const sectionData = section === "references" ? result?.references : result?.citedBy;

  const handleOpenInLibrary = useCallback(
    (paperId: string) => {
      const libPaper = papers.find((p) => p.id === paperId);
      if (libPaper && paperHasReadablePdf(libPaper)) {
        openPaperPdfReader(paperId, libPaper.title);
        return;
      }
      openPaperInMainLibrary(paperId);
    },
    [papers],
  );

  const handleAddToLibrary = useCallback(
    async (entry: PaperCitationEntry) => {
      if (!projectRoot || (!entry.doi && !entry.arxivId)) return;
      const rowKey = entry.openAlexId || entry.doi || entry.title;
      setAddingKey(rowKey);
      try {
        const created = await window.electronAPI.literatureCreateFromIdentifier(projectRoot, {
          doi: entry.doi ?? undefined,
          arxivId: entry.arxivId ?? undefined,
        });
        await refreshLibrary(projectRoot);
        toast.success(created.created ? "Added to library" : "Already in library");
        setExpandedKey(null);
        if (created.paper?.id) {
          handleOpenInLibrary(created.paper.id);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to add to library");
      } finally {
        setAddingKey(null);
      }
    },
    [projectRoot, refreshLibrary, handleOpenInLibrary],
  );

  if (!hasIdentifier) {
    return (
      <p className="px-2 py-3 text-[length:var(--font-size-11)] leading-relaxed text-muted-foreground/55">
        该条目没有 DOI 或 arXiv ID。请在库列表展开条目填写 DOI 后刷新元数据。
      </p>
    );
  }

  if (loading && !result) {
    return (
      <div className="flex justify-center py-8">
        <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (result && !result.ok) {
    return (
      <div className="flex flex-col gap-2 px-2 py-3">
        <p className="text-[length:var(--font-size-11)] leading-relaxed text-red-600/85 dark:text-red-400/85">
          {result.error ?? "Failed to load citations."}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-[length:var(--font-size-11)]"
          onClick={() => void network.retry()}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (!result?.ok || !sectionData) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      {identifierLabel ? (
        <p
          className="truncate px-2 text-[length:var(--font-size-10)] text-muted-foreground/45"
          title={identifierLabel}
        >
          {identifierLabel}
        </p>
      ) : null}
      <CitationListBody
        kind={section}
        section={sectionData}
        result={result}
        loadingMore={loadingMore === section}
        identityIndex={identityIndex}
        addingKey={addingKey}
        expandedKey={expandedKey}
        onToggleExpanded={(key) => setExpandedKey((prev) => (prev === key ? null : key))}
        onLoadMore={() => void loadMore(section)}
        onOpenInLibrary={handleOpenInLibrary}
        onAddToLibrary={(entry) => void handleAddToLibrary(entry)}
      />
    </div>
  );
}

export { useLiteratureCitationNetwork };
