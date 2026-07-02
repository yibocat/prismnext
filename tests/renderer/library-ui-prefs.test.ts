import { describe, it, expect } from "vitest";
import { normalizeLibraryView } from "../../src/renderer/lib/literature/library-ui-prefs";
import type { LiteratureCollection } from "../../src/renderer/types/electron.d";

describe("library-ui-prefs", () => {
  it("normalizeLibraryView keeps valid collection ids", () => {
    const collections: LiteratureCollection[] = [
      {
        id: "local-1",
        name: "Papers",
        parent_id: null,
        sort_order: 0,
        created_at: 0,
        updated_at: 0,
        zotero_key: "ZOT123",
      },
    ];
    expect(
      normalizeLibraryView({ kind: "collection", collectionId: "local-1" }, collections),
    ).toEqual({ kind: "collection", collectionId: "local-1" });
    expect(
      normalizeLibraryView({ kind: "collection", collectionId: "ZOT123" }, collections),
    ).toEqual({ kind: "collection", collectionId: "ZOT123" });
  });

  it("normalizeLibraryView falls back to all when collection missing", () => {
    expect(
      normalizeLibraryView({ kind: "collection", collectionId: "gone" }, []),
    ).toEqual({ kind: "all" });
  });
});
