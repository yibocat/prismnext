import { describe, it, expect } from "vitest";
import { renderAgentsMdFromDigest } from "../../src/main/services/agents-md-scaffold";

describe("renderAgentsMdFromDigest", () => {
  it("includes tree and package sections", () => {
    const md = renderAgentsMdFromDigest({
      projectRoot: "/proj",
      projectHints: ["Electron + Vite desktop app"],
      packageLines: ["- **Name:** demo", "- `dev` → `vite`"],
      treeText: "src/\n  main/",
      configFiles: ["package.json"],
      readmeExcerpt: "# Demo",
      existingNote: null,
    });
    expect(md).toContain("AGENTS.md");
    expect(md).toContain("Electron + Vite");
    expect(md).toContain("src/");
    expect(md).toContain("package.json");
    expect(md).toContain("# Demo");
  });
});
