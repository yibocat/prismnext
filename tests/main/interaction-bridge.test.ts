import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: () => path.join(os.tmpdir(), "prism-ix-tool-userdata"),
  },
  BrowserWindow: {
    getAllWindows: () => [],
  },
}));

import { interactionWriteTool } from "../../src/main/agent/tools/interaction";
import type { ToolExecuteContext } from "../../src/main/agent/tool-host";

const projectRoots: string[] = [];

function toolCtx(projectRoot: string): ToolExecuteContext {
  return {
    runtimeSessionId: "test-session",
    tabId: "test-session",
    turnId: "turn-1",
    toolCallId: "tc-1",
    projectRoot,
    permissionMode: "ask",
  };
}

afterEach(() => {
  for (const root of projectRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("interaction-write native tool", () => {
  it("writes spec and returns fence hint", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ix-tool-proj-"));
    projectRoots.push(projectRoot);
    const figRel = "results/loss.png";
    fs.mkdirSync(path.join(projectRoot, "results"), { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, figRel),
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      ),
    );

    const result = await interactionWriteTool.execute(
      {
        spec: {
          id: "fig.loss",
          title: "Demo loss",
          kind: "figure.static",
          compute: "local",
          revision: 1,
          resources: [{ role: "figure", path: figRel }],
        },
      },
      toolCtx(projectRoot),
    ) as Record<string, unknown>;

    expect(result.ok).toBe(true);
    expect(String(result.fenceMarkdown)).toContain("```interaction");
    expect(String(result.fenceMarkdown)).toContain("id: fig.loss");
    expect(result.relativePath).toBe(".workbench/interactions/fig.loss/spec.json");
  });
});
