import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

vi.mock("electron", () => ({
  app: { getPath: () => join(tmpdir(), "prism-ix-write-userdata") },
  BrowserWindow: { getAllWindows: () => [] },
}));

import { getNativeToolByName } from "../../src/main/agent/tools/index";
import type { ToolExecuteContext } from "../../src/main/agent/tool-host";

const ctx: ToolExecuteContext = {
  runtimeSessionId: "rt-1",
  tabId: "tab-1",
  turnId: "turn-1",
  toolCallId: "call-1",
  projectRoot: "/tmp/unused",
  permissionMode: "auto",
};

describe("interaction-write tool", () => {
  it("coerces sloppy specs and explains remaining failures", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "prism-ix-write-"));
    const localCtx: ToolExecuteContext = { ...ctx, projectRoot: projectDir };
    const write = getNativeToolByName("interaction-write")!;
    try {
      mkdirSync(join(projectDir, "figures"), { recursive: true });
      writeFileSync(join(projectDir, "figures", "som-cell.pdf"), "%PDF-1.4\n");

      const ok = (await write.execute(
        {
          spec: JSON.stringify({
            id: "som-cell-diagram",
            title: "LSTM 单元结构",
            kind: "figure:static",
            path: "figures/som-cell.pdf",
          }),
        },
        localCtx,
      )) as { ok?: boolean; fenceMarkdown?: string };
      expect(ok.ok).toBe(true);
      expect(ok.fenceMarkdown).toContain("```interaction");

      const bad = (await write.execute({ spec: { title: "No id" } }, localCtx)) as {
        ok?: boolean;
        error?: string;
        hint?: string;
      };
      expect(bad.ok).toBe(false);
      expect(bad.error).toBe("invalid_spec");
      expect(bad.hint).toMatch(/id/i);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });
});
