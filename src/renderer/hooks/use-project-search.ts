import { useMemo } from "react";
import { useDocumentStore } from "@/stores/document-store";

export interface SearchResult {
  fileId: string;
  fileName: string;
  line: number;
  preview: string;
}

export function useProjectSearch(query: string): SearchResult[] {
  const files = useDocumentStore((s) => s.files);
  const openedContents = useDocumentStore((s) => s.openedContents);

  return useMemo(() => {
    if (!query || query.length < 2) return [];

    const results: SearchResult[] = [];
    const lowerQuery = query.toLowerCase();
    const MAX_RESULTS = 100;

    for (const file of files) {
      if (!file.name.endsWith(".tex")) continue;
      const content = openedContents.get(file.id)?.content;
      if (!content) continue;

      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (!lines[i].toLowerCase().includes(lowerQuery)) continue;
        const preview = lines[i].trim().slice(0, 100);
        results.push({
          fileId: file.id,
          fileName: file.name,
          line: i + 1,
          preview,
        });
        if (results.length >= MAX_RESULTS) break;
      }
      if (results.length >= MAX_RESULTS) break;
    }

    return results;
  }, [query, files, openedContents]);
}
