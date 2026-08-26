import { describe, expect, it } from "vitest";
import { createPaper, searchPapers } from "../../src/main/literature/facade";
import { createAgentNativeTools } from "../../src/main/agent/agent-service";
import { createHostContext, dispatchHostMethod } from "../../src/host/handler-registry";
import { tempLiteratureProject } from "./helpers/temp-literature-project";

describe("host literature library (RW-3.1)", () => {
  it("searches a paper stored under the remote workbench home", async () => {
    const root = tempLiteratureProject("p_remote_lib");
    createPaper(root, { title: "Attention Is All You Need", authors: "Vaswani" });
    const ctx = createHostContext();
    ctx.remoteRoot = root;
    ctx.projectId = "p_remote_lib";

    const listed = await dispatchHostMethod("literature:list", { projectRoot: root }, ctx) as Array<{
      title: string;
    }>;
    expect(listed.map((paper) => paper.title)).toContain("Attention Is All You Need");

    const searched = await dispatchHostMethod(
      "literature:search",
      { projectRoot: root, query: "Attention", limit: 20 },
      ctx,
    ) as Array<{ title: string }>;
    expect(searched.some((paper) => paper.title.includes("Attention"))).toBe(true);
  });

  it("lets the literature-search tool read the remote library", async () => {
    const root = tempLiteratureProject("p_remote_tool");
    createPaper(root, { title: "Denoising Diffusion Probabilistic Models" });
    const tools = createAgentNativeTools({ pendingRemoteModules: true });
    const search = tools.find((tool) => tool.name === "literature-search");
    expect(search).toBeTruthy();
    const result = await search!.execute({ query: "Diffusion" }, {
      runtimeSessionId: "rt",
      tabId: "tab",
      turnId: "t1",
      toolCallId: "c1",
      projectRoot: root,
      permissionMode: "auto",
    }) as { count: number; results: Array<{ title?: string }> };
    expect(result.count).toBeGreaterThan(0);
    expect(result.results.some((paper) => String(paper.title ?? "").includes("Diffusion"))).toBe(true);
    expect(searchPapers(root, "Diffusion").length).toBeGreaterThan(0);
  });
});
