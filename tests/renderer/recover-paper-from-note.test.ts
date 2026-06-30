import { describe, expect, it } from "vitest";
import {
  paperPatchFromNote,
  patchNoteLinkFrontmatter,
} from "@/lib/literature/recover-paper-from-note";

describe("paperPatchFromNote", () => {
  it("reads metadata from frontmatter and path", () => {
    const content = `---
paper_id: old
bibkey: N98JPVKU
title: Distance Matrix GDL
authors: Zian Li, Muhan Zhang
doi: 10.5555/example
arxiv: 2301.12345
---
`;
    const patch = paperPatchFromNote(content, "notes/N98JPVKU/2026-06-30-note.md", "notes");
    expect(patch.bibkey).toBe("N98JPVKU");
    expect(patch.title).toBe("Distance Matrix GDL");
    expect(patch.doi).toBe("10.5555/example");
    expect(patch.arxiv_id).toBe("2301.12345");
    expect(patch.authors).toContain("Li");
  });
});

describe("patchNoteLinkFrontmatter", () => {
  it("updates paper_id and bibkey in existing frontmatter", () => {
    const content = `---
paper_id: stale-id
bibkey: OLD
title: My Paper
created: 2026-06-30
---

# Body
`;
    const next = patchNoteLinkFrontmatter(content, { paperId: "new-id", bibkey: "NEWKEY" });
    expect(next).toContain("paper_id: new-id");
    expect(next).toContain("bibkey: NEWKEY");
    expect(next).toContain("title: My Paper");
    expect(next).toContain("# Body");
  });
});
