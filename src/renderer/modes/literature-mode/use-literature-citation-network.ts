import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { LiteraturePaper, PaperCitationNetworkResult } from "@/types/electron.d";
import type { PaperCitationSectionKind } from "../../../shared/literature/paper-citation-network";
import type { PaperCitationSection } from "../../../shared/literature/paper-citation-network";

function mergeSection(
  prev: PaperCitationSection | undefined,
  next: PaperCitationSection,
): PaperCitationSection {
  if (!prev) return next;
  const seen = new Set(prev.items.map((i) => i.openAlexId));
  const merged = [...prev.items];
  for (const item of next.items) {
    if (seen.has(item.openAlexId)) continue;
    merged.push(item);
    seen.add(item.openAlexId);
  }
  return {
    totalCount: next.totalCount,
    items: merged,
    hasMore: next.hasMore,
    nextCursor: next.nextCursor,
  };
}

export function useLiteratureCitationNetwork(
  projectRoot: string | null,
  paper: LiteraturePaper,
  enabled: boolean,
) {
  const [result, setResult] = useState<PaperCitationNetworkResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState<PaperCitationSectionKind | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadNetwork = useCallback(
    async (refresh = false) => {
      if (!projectRoot || !enabled) return;
      setLoading(true);
      try {
        const data = await window.electronAPI.literatureGetCitationNetwork(
          projectRoot,
          paper.id,
          { refresh },
        );
        setResult(data);
      } finally {
        setLoading(false);
      }
    },
    [projectRoot, paper.id, enabled],
  );

  useEffect(() => {
    setResult(null);
  }, [paper.id]);

  useEffect(() => {
    if (!enabled) return;
    if (result !== null) return;
    void loadNetwork(false);
  }, [enabled, loadNetwork, result]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadNetwork(true);
    } finally {
      setRefreshing(false);
    }
  }, [loadNetwork]);

  const loadMore = useCallback(
    async (kind: PaperCitationSectionKind) => {
      if (!projectRoot || !result?.ok) return;
      const section = kind === "references" ? result.references : result.citedBy;
      if (!section?.nextCursor) return;

      setLoadingMore(kind);
      try {
        const page = await window.electronAPI.literatureGetCitationNetworkPage(
          projectRoot,
          paper.id,
          kind,
          section.nextCursor,
        );
        if (!page.ok) {
          toast.error(page.error ?? "Failed to load more");
          return;
        }
        setResult((prev) => {
          if (!prev?.ok) return page;
          if (kind === "references" && page.references) {
            return { ...prev, references: mergeSection(prev.references, page.references) };
          }
          if (kind === "citedBy" && page.citedBy) {
            return { ...prev, citedBy: mergeSection(prev.citedBy, page.citedBy) };
          }
          return prev;
        });
      } finally {
        setLoadingMore(null);
      }
    },
    [projectRoot, paper.id, result],
  );

  return {
    result,
    loading,
    loadingMore,
    refreshing,
    refresh,
    loadMore,
    retry: () => void loadNetwork(true),
  };
}
