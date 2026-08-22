import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  mergeLibraryTaskHits,
  hitsFromLiteratureSearchResult,
  hitsFromLiteratureReadResult,
  recordLibraryTaskHitsFromToolSession,
  readLibraryTaskHitRecords,
  formatLibraryTaskHitsMarkdown,
  LIBRARY_TASK_APPENDIX_MARKER,
} from "../../src/main/session/library-task-context";
import { setWorkbenchUserHomeOverride } from "../../src/main/workbench/home";

const PARENT = "parent-session";
const SUB = `sub-${PARENT}-1710000000000`;

describe("library-task-context", () => {
  let home: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "prism-lib-task-home-"));
    setWorkbenchUserHomeOverride(home);
  });

  afterEach(() => {
    setWorkbenchUserHomeOverride(null);
    try { fs.rmSync(home, { recursive: true, force: true }); } catch {}
  });

  it("parses search and read tool results into hits", () => {
    const searchHits = hitsFromLiteratureSearchResult({
      results: [
        { bibkey: "a2024", title: "Paper A", year: 2024, ai_summary: "Summary A" },
        { title: "no key" },
      ],
    });
    expect(searchHits).toHaveLength(1);
    expect(searchHits[0]?.bibkey).toBe("a2024");

    const readHits = hitsFromLiteratureReadResult({
      paper: { bibkey: "b2023", title: "Paper B", year: 2023, abstract: "Abstract B" },
    });
    expect(readHits[0]?.bibkey).toBe("b2023");
  });

  it("merges hits under parent session when subagent tools run", () => {
    recordLibraryTaskHitsFromToolSession(SUB, [
      { bibkey: "smith2024", title: "World Models", year: 2024, summary: "RL world models." },
    ]);
    recordLibraryTaskHitsFromToolSession(SUB, [
      { bibkey: "jones2023", title: "Follow-up", year: 2023, summary: "Later work." },
    ]);

    const records = readLibraryTaskHitRecords(PARENT);
    expect(records).toHaveLength(2);
    expect(records.map((r) => r.bibkey)).toEqual(["jones2023", "smith2024"]);
  });

  it("does not record hits for main chat session", () => {
    mergeLibraryTaskHits(PARENT, [{ bibkey: "direct", title: "Direct" }]);
    recordLibraryTaskHitsFromToolSession(PARENT, [{ bibkey: "ignored", title: "X" }]);
    expect(readLibraryTaskHitRecords(PARENT)).toHaveLength(1);
    expect(readLibraryTaskHitRecords(PARENT)[0]?.bibkey).toBe("direct");
  });

  it("formats markdown appendix table", () => {
    const md = formatLibraryTaskHitsMarkdown([
      { bibkey: "smith2024", title: "World Models", year: 2024, summary: "Short summary." },
    ]);
    expect(md).toContain(LIBRARY_TASK_APPENDIX_MARKER);
    expect(md).toContain("| smith2024 | World Models | 2024 |");
    expect(md).toContain("[@bibkey]");
  });
});
