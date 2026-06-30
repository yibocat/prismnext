import { useEffect, useMemo, useState } from "react";
import type { RightTab } from "@/lib/workspace/mode-registry";
import { useDocumentStore } from "@/stores/document-store";
import { useLiteratureStore } from "@/stores/literature-store";
import { LiteratureLibrary } from "./literature-library";
import { LiteratureSessionCitations } from "./literature-session-citations";
import { BETTER_BIBTEX_URL } from "./literature-format";
import { cn } from "@/lib/utils";

function LiteratureBbtBanner() {
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
      <span className="min-w-0 flex-1">Install Better BibTeX for stable citekeys</span>
      <button
        type="button"
        className="shrink-0 text-foreground/85 hover:text-foreground underline underline-offset-2"
        onClick={() => void window.electronAPI.shellOpenExternal(BETTER_BIBTEX_URL)}
      >
        Get BBT
      </button>
      <button
        type="button"
        className="shrink-0 text-muted-foreground/55 hover:text-foreground"
        onClick={() => dismissBbtBanner()}
      >
        Dismiss
      </button>
    </div>
  );
}

export function LiteratureContent({ tab, isActive }: { tab: RightTab; isActive: boolean }) {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const papers = useLiteratureStore((s) => s.papers);
  const bootstrapLiterature = useLiteratureStore((s) => s.bootstrapLiterature);
  const subview = useLiteratureStore((s) => s.librarySubview);
  const pendingCitationJumpRefId = useLiteratureStore((s) => s.pendingCitationJumpRefId);
  const clearPendingCitationJump = useLiteratureStore((s) => s.clearPendingCitationJump);
  const [highlightRefId, setHighlightRefId] = useState<number | null>(null);

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
        Open a project first.
      </div>
    );
  }

  if (tab.literaturePaperId && paper) {
    return null;
  }

  return (
    <div className={cn("flex h-full min-h-0 flex-col", !isActive && "hidden")}>
      <LiteratureBbtBanner />
      {subview === "library" ? (
        <LiteratureLibrary />
      ) : (
        <LiteratureSessionCitations
          highlightRefId={highlightRefId}
          onHighlightConsumed={() => setHighlightRefId(null)}
        />
      )}
    </div>
  );
}
