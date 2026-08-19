import { describe, expect, it } from "vitest";
import {
  OPEN_BUILTIN_ROSTER,
  buildLiveTaskRosterMarkdown,
  buildSubagentRosterMarkdown,
} from "../../src/shared/subagent-roster";

describe("subagent-roster", () => {
  it("OPEN_BUILTIN_ROSTER covers open Task builtins only", () => {
    const ids = OPEN_BUILTIN_ROSTER.map((e) => e.id);
    expect(ids).toEqual(["general", "explore", "command", "scout"]);
    expect(ids).not.toContain("plan");
    expect(ids).not.toContain("build");
  });

  it("buildSubagentRosterMarkdown lists open builtins and experts with goodFor/notFor", () => {
    const md = buildSubagentRosterMarkdown([
      { id: "methodology-auditor", name: "Methodology Auditor", description: "Audit methods" },
    ]);
    expect(md).toContain("general");
    expect(md).toContain("explore");
    expect(md).toContain("methodology-auditor");
    expect(md).not.toMatch(/^- `plan`/m);
    expect(md).not.toMatch(/^- `build`/m);
    expect(md).toMatch(/Good for|擅长|good for/i);
    expect(md).toContain("### Built-in");
    expect(md).toContain("### Project experts");
    expect(md).toContain("Choose by fit");
    expect(md).toContain("Do not Task to `plan` or `build`");
  });

  it("buildLiveTaskRosterMarkdown lists only session experts and forbids disk discovery", () => {
    const md = buildLiveTaskRosterMarkdown([
      {
        id: "literature-synthesizer",
        name: "Literature Synthesizer",
        description: "Cross-paper synthesis",
        fqid: "prismnext.core:literature-synthesizer",
      },
    ]);
    expect(md).toContain("## Available subagents (via Task)");
    expect(md).toContain("`literature-synthesizer`");
    expect(md).toContain("`prismnext.core:literature-synthesizer`");
    expect(md).toContain("call the **task** tool immediately");
    expect(md).toContain("Do not");
    expect(md).toContain("team.json");
    expect(md).not.toContain("`general`");
    expect(md).not.toContain("`explore`");
    expect(md).not.toContain("### Built-in");
  });

  it("buildLiveTaskRosterMarkdown says when no experts are enabled", () => {
    const md = buildLiveTaskRosterMarkdown([]);
    expect(md).toContain("No project experts are enabled");
    expect(md).toContain("There is no `task` tool");
    expect(md).toContain("team.json");
  });
});
