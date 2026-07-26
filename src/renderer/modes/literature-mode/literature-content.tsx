import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { RightTab } from "@/lib/workspace/mode-registry";
import { useDocumentStore } from "@/stores/document-store";
import { useLiteratureStore } from "@/stores/literature-store";
import { useLiteraturePdfDrop } from "@/lib/literature/use-literature-pdf-drop";
import { LiteratureLibrary } from "./literature-library";
import { LiteratureSessionCitations } from "./literature-session-citations";
import { BETTER_BIBTEX_URL } from "./literature-format";
import { cn } from "@/lib/utils";
import { literatureLibraryPdfDropZoneClass } from "./literature-list-chrome";

function LiteratureBbtBanner() {
  const { t } = useTranslation();
  const zoteroStatus = useLiteratureStore((s) => s.zoteroStatus);
  const dismissed = useLiteratureStore((s) => s.bbtBannerDismissed);
  const dismissBbtBanner = useLiteratureStore((s) => s.dismissBbtBanner);

  const show =
    !dismissed && zoteroStatus?.localReachable && !zoteroStatus?.bbtInstalled;

  if (!show) return null;

  return (
    <div
      className="flex shrink-0 items-center gap-2 border-b border-border/50 bg-muted/30 px-3 py-1.5 text-[length:var(--font-size-12)] text-muted-foreground"
    >
      <span className="min-w-0 flex-1">{t("modes.literature.bbtBanner")}</span>
      <button
        type="button"
        className="shrink-0 text-foreground/85 hover:text-foreground underline underline-offset-2"
        onClick={() => void window.electronAPI.shellOpenExternal(BETTER_BIBTEX_URL)}
      >
        {t("modes.literature.getBbt")}
      </button>
      <button
        type="button"
        className="shrink-0 text-muted-foreground/55 hover:text-foreground"
        onClick={() => dismissBbtBanner()}
      >
        {t("modes.literature.dismiss")}
      </button>
    </div>
  );
}

export function LiteratureContent({ tab, isActive }: { tab: RightTab; isActive: boolean }) {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const papers = useLiteratureStore((s) => s.papers);
  const bootstrapLiterature = useLiteratureStore((s) => s.bootstrapLiterature);
  const subview = useLiteratureStore((s) => s.librarySubview);
  const pendingCitationJumpRefId = useLiteratureStore((s) => s.pendingCitationJumpRefId);
  const clearPendingCitationJump = useLiteratureStore((s) => s.clearPendingCitationJump);
  const [highlightRefId, setHighlightRefId] = useState<number | null>(null);
  const consumeHighlight = useCallback(() => setHighlightRefId(null), []);
  const { dragActive, zoneRef, dropHandlers } = useLiteraturePdfDrop(
    subview === "library" ? projectRoot : null,
  );

  const paper = useMemo(
    () =>
      tab.literaturePaperId ? papers.find((p) => p.id === tab.literaturePaperId) ?? null : null,
    [papers, tab.literaturePaperId],
  );

  useEffect(() => {
    if (!projectRoot) return;
    void bootstrapLiterature(projectRoot);
  }, [projectRoot, bootstrapLiterature]);

  useEffect(() => {
    if (subview !== "session-citations" || pendingCitationJumpRefId == null) return;
    setHighlightRefId(pendingCitationJumpRefId);
    clearPendingCitationJump();
  }, [subview, pendingCitationJumpRefId, clearPendingCitationJump]);

  if (!projectRoot) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        {t("modes.literature.openProjectFirst")}
      </div>
    );
  }

  if (tab.literaturePaperId && paper) {
    return null;
  }

  return (
    <div
      ref={zoneRef}
      className={cn(
        "relative flex h-full min-h-0 flex-col rounded-sm",
        dragActive && literatureLibraryPdfDropZoneClass,
        !isActive && "hidden",
      )}
      {...dropHandlers}
    >
      <LiteratureBbtBanner />
      {subview === "library" ? (
        <LiteratureLibrary pdfDragActive={dragActive} />
      ) : (
        <LiteratureSessionCitations
          highlightRefId={highlightRefId}
          onHighlightConsumed={consumeHighlight}
        />
      )}
    </div>
  );
}
