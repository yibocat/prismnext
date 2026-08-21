import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  enrichTaskToolResultContent,
  formatSessionCitationsMarkdown,
  readSessionCitationRecords,
} from "../../src/main/services/session-citations-context";
import { sessionCitationsDir, setWorkbenchUserHomeOverride } from "../../src/main/workbench/home";

const SESSION = "sess-parent";

describe("session-citations-context", () => {
  let home: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "prism-citations-home-"));
    setWorkbenchUserHomeOverride(home);
    const dir = sessionCitationsDir(SESSION);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "staging.json"),
      JSON.stringify([
        {
          refId: 1,
          doi: null,
          arxivId: "2405.00133",
          title: "World Models RL",
          year: 2024,
          summary: "Learning world models for RL.",
        },
        {
          refId: 2,
          doi: "10.1234/example",
          arxivId: null,
          title: "Example Paper",
          year: 2023,
          summary: "An example.",
        },
      ]),
      "utf-8",
    );
  });

  afterEach(() => {
    setWorkbenchUserHomeOverride(null);
    try { fs.rmSync(home, { recursive: true, force: true }); } catch {}
  });

  it("reads staging records for parent session", () => {
    const records = readSessionCitationRecords(SESSION);
    expect(records).toHaveLength(2);
    expect(records[0]?.title).toBe("World Models RL");
  });

  it("formats markdown table for orchestrator context", () => {
    const md = formatSessionCitationsMarkdown(readSessionCitationRecords(SESSION));
    expect(md).toContain("World Models RL");
    expect(md).toContain("| 1 |");
    expect(md).toContain("Do **not** call `literature-stage` again");
  });

  it("enriches task tool result without duplicating appendix", () => {
    const enriched = enrichTaskToolResultContent(SESSION, "Task done. Use [1] and [2].");
    expect(enriched).toContain("Task done");
    expect(enriched).toContain("World Models RL");
    const again = enrichTaskToolResultContent(SESSION, enriched);
    expect(again.split("## Session citations (this chat)").length).toBe(2);
  });

  it("enriches task tool result with library hits appendix", () => {
    fs.writeFileSync(
      path.join(sessionCitationsDir(SESSION), "library-task-hits.json"),
      JSON.stringify([
        {
          bibkey: "smith2024",
          title: "World Models RL",
          year: 2024,
          summary: "Learning world models.",
        },
      ]),
      "utf-8",
    );
    const enriched = enrichTaskToolResultContent(SESSION, "Found relevant papers.");
    expect(enriched).toContain("## Library papers (this Task)");
    expect(enriched).toContain("| smith2024 |");
    expect(enriched).toContain("## Session citations (this chat)");
    const again = enrichTaskToolResultContent(SESSION, enriched);
    expect(again.split("## Library papers (this Task)").length).toBe(2);
  });

  it("normalizes loose [@ bibkey ] markers in task enrich", () => {
    const enriched = enrichTaskToolResultContent(SESSION, "Cite [ @ smith2024 ] here.");
    expect(enriched).toContain("[@smith2024]");
  });

  it("writeToolOutputIntoPartData updates string and object outputs", async () => {
    const { writeToolOutputIntoPartData, readToolPartOutputText } = await import(
      "../../src/main/services/session-citations-context"
    );

    const stringPart = {
      type: "tool",
      callID: "call-task",
      state: { status: "completed", output: "short summary" },
    };
    expect(writeToolOutputIntoPartData(stringPart, "short summary\n\n## Session citations")).toBe(true);
    expect(readToolPartOutputText(stringPart.state.output)).toContain("Session citations");

    const objectPart = {
      type: "tool",
      callID: "call-task-2",
      state: { status: "completed", output: { content: "before" } },
    };
    expect(writeToolOutputIntoPartData(objectPart, "after enrich")).toBe(true);
    expect(readToolPartOutputText(objectPart.state.output)).toBe("after enrich");
  });
});
