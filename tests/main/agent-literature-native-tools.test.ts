import { describe, expect, it } from "vitest";
import { createLiteratureNativeTools } from "../../src/main/agent/literature-native-tools";
import { createPiLabNativeTools } from "../../src/main/agent/pi-lab-service";
import { createPiNativeTools } from "../../src/main/agent/pi-sdk-runtime";
import type { ToolExecuteContext } from "../../src/main/agent/tool-host";
import type { LiteratureActionRequest } from "../../src/main/services/literature-bridge";

const ctx: ToolExecuteContext = {
  runtimeSessionId: "rt-lab-1",
  tabId: "pi-lab",
  turnId: "turn-1",
  toolCallId: "call-1",
  projectRoot: "/tmp/lab-project",
  permissionMode: "auto",
};

const LITERATURE_EXTRA = [
  "literature-read",
  "literature-read-pdf",
  "literature-intensive-reading",
  "literature-stage",
  "literature-add",
  "literature-delete",
  "citation-health",
  "literature-export-bib",
] as const;

describe("literature native tools", () => {
  it("maps Lab tool args onto literature-bridge dispatch without writing request.json", async () => {
    const calls: LiteratureActionRequest[] = [];
    const tools = createLiteratureNativeTools({
      executeLiteratureAction: async (req) => {
        calls.push(req);
        return { ok: true, action: req.action };
      },
    });

    expect(tools.map((tool) => tool.name)).toEqual([...LITERATURE_EXTRA]);

    const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
    await byName["literature-read"]!.execute({ bibkey: "Ada24" }, ctx);
    await byName["literature-read-pdf"]!.execute({
      bibkey: "Ada24",
      pages: "1-3",
      query: "graph",
      force: true,
    }, ctx);
    await byName["literature-intensive-reading"]!.execute({ action: "add", bibkey: "Ada24" }, ctx);
    await byName["literature-stage"]!.execute({
      doi: "10.1/ada",
      discoveredFrom: "literature-discover",
    }, ctx);
    await byName["literature-add"]!.execute({ arxivId: "2401.00001", collection: "core" }, ctx);
    await byName["literature-delete"]!.execute({ bibkey: "Ada24" }, ctx);
    await byName["citation-health"]!.execute({ verify: false }, ctx);
    await byName["literature-export-bib"]!.execute({ all: true }, ctx);

    expect(calls).toEqual([
      {
        action: "read",
        projectRoot: "/tmp/lab-project",
        sessionId: "rt-lab-1",
        bibkey: "Ada24",
      },
      {
        action: "read-pdf",
        projectRoot: "/tmp/lab-project",
        sessionId: "rt-lab-1",
        bibkey: "Ada24",
        pages: "1-3",
        query: "graph",
        force: true,
      },
      {
        action: "intensive-reading",
        projectRoot: "/tmp/lab-project",
        sessionId: "rt-lab-1",
        intensiveAction: "add",
        bibkey: "Ada24",
      },
      {
        action: "stage",
        projectRoot: "/tmp/lab-project",
        sessionId: "rt-lab-1",
        doi: "10.1/ada",
        discoveredFrom: "literature-discover",
      },
      {
        action: "add",
        projectRoot: "/tmp/lab-project",
        sessionId: "rt-lab-1",
        arxivId: "2401.00001",
        collection: "core",
      },
      {
        action: "delete",
        projectRoot: "/tmp/lab-project",
        sessionId: "rt-lab-1",
        bibkey: "Ada24",
      },
      {
        action: "citation-health",
        projectRoot: "/tmp/lab-project",
        sessionId: "rt-lab-1",
        verify: false,
      },
      {
        action: "export-bib",
        projectRoot: "/tmp/lab-project",
        sessionId: "rt-lab-1",
        all: true,
      },
    ]);
    expect(JSON.stringify(calls)).not.toMatch(/request\.json/);
  });

  it("registers the literature family on Lab and on the Pi catalog", () => {
    const labNames = createPiLabNativeTools().map((tool) => tool.name);
    for (const name of LITERATURE_EXTRA) {
      expect(labNames).toContain(name);
    }

    const piNames = createPiNativeTools({
      toolHost: { execute: async () => ({ ok: true }) },
      getContext: () => ctx,
    }).map((tool) => tool.name);
    for (const name of LITERATURE_EXTRA) {
      expect(piNames).toContain(name);
    }
  });
});
