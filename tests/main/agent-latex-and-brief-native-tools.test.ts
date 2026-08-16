import { describe, expect, it } from "vitest";
import { createLatexNativeTools } from "../../src/main/agent/latex-native-tools";
import { createResearchBriefNativeTools } from "../../src/main/agent/research-brief-native-tools";
import { createPiLabNativeTools } from "../../src/main/agent/pi-lab-service";
import { createPiNativeTools } from "../../src/main/agent/pi-sdk-runtime";
import type { ToolExecuteContext } from "../../src/main/agent/tool-host";
import type { LatexActionRequest } from "../../src/main/services/latex-bridge";
import type { ResearchBriefActionRequest } from "../../src/main/services/research-brief-bridge";

const ctx: ToolExecuteContext = {
  runtimeSessionId: "rt-lab-1",
  tabId: "pi-lab",
  turnId: "turn-1",
  toolCallId: "call-1",
  projectRoot: "/tmp/lab-project",
  permissionMode: "auto",
};

describe("latex and research brief native tools", () => {
  it("maps latex-root and latex-compile without writing bridge request.json", async () => {
    const calls: LatexActionRequest[] = [];
    const tools = createLatexNativeTools({
      executeLatexAction: async (req) => {
        calls.push(req);
        return { ok: true, action: req.action };
      },
    });

    expect(tools.map((t) => t.name)).toEqual(["latex-root", "latex-compile"]);

    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    await byName["latex-root"]!.execute({ mainFile: "src/main.tex" }, ctx);
    await byName["latex-compile"]!.execute({ mainFile: "src/main.tex", useTexlive: true }, ctx);

    expect(calls).toEqual([
      {
        action: "root",
        projectRoot: "/tmp/lab-project",
        sessionId: "rt-lab-1",
        mainFile: "src/main.tex",
      },
      {
        action: "compile",
        projectRoot: "/tmp/lab-project",
        sessionId: "rt-lab-1",
        mainFile: "src/main.tex",
        useTexlive: true,
      },
    ]);
  });

  it("maps research-brief-read without writing bridge request.json", async () => {
    const calls: ResearchBriefActionRequest[] = [];
    const tools = createResearchBriefNativeTools({
      executeResearchBriefAction: (req) => {
        calls.push(req);
        return { ok: true, action: req.action };
      },
    });

    expect(tools.map((t) => t.name)).toEqual(["research-brief-read"]);

    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    await byName["research-brief-read"]!.execute({}, ctx);

    expect(calls).toEqual([
      {
        action: "read",
        projectRoot: "/tmp/lab-project",
        sessionId: "rt-lab-1",
      },
    ]);
  });

  it("registers latex and brief tools in Pi Lab and Pi native catalog", () => {
    const labNames = createPiLabNativeTools().map((t) => t.name);
    expect(labNames).toContain("latex-root");
    expect(labNames).toContain("latex-compile");
    expect(labNames).toContain("research-brief-read");

    const piNames = createPiNativeTools({
      toolHost: { execute: async () => ({ ok: true }) },
      getContext: () => ctx,
    }).map((t) => t.name);
    expect(piNames).toContain("latex-root");
    expect(piNames).toContain("latex-compile");
    expect(piNames).toContain("research-brief-read");
  });
});
