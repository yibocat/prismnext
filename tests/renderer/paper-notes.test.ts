import { describe, expect, it } from "vitest";
import {
  listOrphanPaperNotes,
  listPaperNotes,
  resolvePaperNotePath,
  paperNoteDirName,
  resolvePaperForNote,
  zoteroLinkedPapersWithNotes,
} from "@/lib/literature/paper-notes";
import type { LiteraturePaper } from "@/types/electron.d";

function paper(overrides: Partial<LiteraturePaper> = {}): LiteraturePaper {
  return {
    id: "p1",
    bibkey: "N98JPVKU",
    title: "Test Paper",
    authors: "[]",
    year: 2023,
    zotero_key: null,
    ...overrides,
  } as LiteraturePaper;
}

const files = [
  { id: "f1", relativePath: "notes/N98JPVKU/2026-06-30-note.md", name: "2026-06-30-note.md" },
  { id: "f2", relativePath: "notes/other-bibkey/2026-06-29-note.md", name: "2026-06-29-note.md" },
  { id: "f3", relativePath: "notes/moved/2026-06-28-note.md", name: "2026-06-28-note.md" },
] as never[];

describe("paperNoteDirName", () => {
  it("uses cite key (bibkey) as folder name", () => {
    expect(paperNoteDirName(paper())).toBe("N98JPVKU");
    expect(paperNoteDirName(paper({ bibkey: "vaswani2017attention" }))).toBe(
      "vaswani2017attention",
    );
  });

  it("falls back to year-title slug without bibkey", () => {
    expect(paperNoteDirName(paper({ bibkey: "", title: "Test Paper", year: 2023 }))).toBe(
      "2023-test",
    );
  });
});

describe("resolvePaperForNote", () => {
  const papers = [paper(), paper({ id: "p2", bibkey: "other", title: "Other" })];

  it("prefers paper_id then falls back to bibkey", () => {
    const byId = resolvePaperForNote("---\npaper_id: p1\nbibkey: wrong\n---\n", papers);
    expect(byId?.id).toBe("p1");

    const staleId = resolvePaperForNote("---\npaper_id: deleted\nbibkey: N98JPVKU\n---\n", papers);
    expect(staleId?.bibkey).toBe("N98JPVKU");
  });
});

describe("listPaperNotes", () => {
  it("matches folder path and frontmatter bibkey", () => {
    const byPath = listPaperNotes(paper(), files, "notes");
    expect(byPath.map((n) => n.relativePath)).toContain("notes/N98JPVKU/2026-06-30-note.md");

    const legacySlugFiles = [
      {
        id: "f4",
        relativePath: "notes/2023-test/2026-06-30-note.md",
        name: "2026-06-30-note.md",
      },
    ] as never[];
    const legacySlug = listPaperNotes(paper(), legacySlugFiles, "notes");
    expect(legacySlug.map((n) => n.relativePath)).toContain("notes/2023-test/2026-06-30-note.md");

    const contentByPath = new Map([
      [
        "notes/moved/2026-06-28-note.md",
        "---\npaper_id: stale\nbibkey: N98JPVKU\n---\n\nbody",
      ],
    ]);
    const withFm = listPaperNotes(paper(), files, "notes", contentByPath);
    expect(withFm.map((n) => n.relativePath)).toContain("notes/moved/2026-06-28-note.md");
  });
});

describe("resolvePaperNotePath", () => {
  it("returns persisted path when it still exists", () => {
    const notes = [{ relativePath: "notes/key/a.md", name: "a.md" }];
    expect(resolvePaperNotePath("notes/key/a.md", notes)).toBe("notes/key/a.md");
  });

  it("falls back to first note when persisted path is missing or stale", () => {
    const notes = [
      { relativePath: "notes/key/b.md", name: "b.md" },
      { relativePath: "notes/key/a.md", name: "a.md" },
    ];
    expect(resolvePaperNotePath(null, notes)).toBe("notes/key/b.md");
    expect(resolvePaperNotePath("notes/key/deleted.md", notes)).toBe("notes/key/b.md");
  });

  it("returns null when there are no notes", () => {
    expect(resolvePaperNotePath("notes/key/a.md", [])).toBeNull();
  });
});

describe("zoteroLinkedPapersWithNotes", () => {
  it("lists zotero papers that have notes on disk", () => {
    const papers = [
      paper({ zotero_key: "ZK1" }),
      paper({ id: "p2", bibkey: "local", zotero_key: null }),
    ];
    const atRisk = zoteroLinkedPapersWithNotes(papers, files, "notes");
    expect(atRisk).toHaveLength(1);
    expect(atRisk[0]?.paper.bibkey).toBe("N98JPVKU");
    expect(atRisk[0]?.noteCount).toBe(1);
  });
});

describe("listOrphanPaperNotes", () => {
  it("finds notes whose library entry is missing", () => {
    const noteFiles = [
      { id: "f1", relativePath: "notes/N98JPVKU/2026-06-30-note.md", name: "2026-06-30-note.md" },
    ] as never[];
    const content = new Map([
      [
        "notes/N98JPVKU/2026-06-30-note.md",
        "---\npaper_id: deleted-id\nbibkey: N98JPVKU\ntitle: Orphan Paper\n---\n\nbody",
      ],
    ]);
    const orphans = listOrphanPaperNotes([paper()], noteFiles, "notes", content);
    expect(orphans).toHaveLength(0);

    const orphansMissing = listOrphanPaperNotes([], noteFiles, "notes", content);
    expect(orphansMissing).toHaveLength(1);
    expect(orphansMissing[0]?.bibkey).toBe("N98JPVKU");
    expect(orphansMissing[0]?.title).toBe("Orphan Paper");
  });

  it("skips notes already linked by bibkey fallback", () => {
    const noteFiles = [
      { id: "f3", relativePath: "notes/moved/2026-06-28-note.md", name: "2026-06-28-note.md" },
    ] as never[];
    const content = new Map([
      [
        "notes/moved/2026-06-28-note.md",
        "---\npaper_id: stale\nbibkey: N98JPVKU\n---\n",
      ],
    ]);
    const orphans = listOrphanPaperNotes([paper()], noteFiles, "notes", content);
    expect(orphans).toHaveLength(0);
  });

  it("ignores general notebook notes without literature frontmatter", () => {
    const noteFiles = [
      { id: "g1", relativePath: "notes/meeting/2026-06-30.md", name: "2026-06-30.md" },
      { id: "g2", relativePath: "notes/ideas.md", name: "ideas.md" },
    ] as never[];
    const content = new Map([
      ["notes/meeting/2026-06-30.md", "# Team sync\n\nDiscuss roadmap."],
      ["notes/ideas.md", "---\ntags: research\n---\n\nRandom thought"],
    ]);
    const orphans = listOrphanPaperNotes([], noteFiles, "notes", content);
    expect(orphans).toHaveLength(0);
  });
});
