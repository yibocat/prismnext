import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createShellAndFsNativeTools } from "../../src/main/agent/shell-and-fs-native-tools";
import { createPiLabNativeTools } from "../../src/main/agent/pi-lab-service";
import { createPiNativeTools } from "../../src/main/agent/pi-sdk-runtime";
import type { ToolExecuteContext } from "../../src/main/agent/tool-host";

describe("shell and fs native tools", () => {
  it("executes bash, delete, move, project-rule-write in memory", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "prism-shell-test-"));
    const ctx: ToolExecuteContext = {
      runtimeSessionId: "rt-lab-1",
      tabId: "pi-lab",
      turnId: "turn-1",
      toolCallId: "call-1",
      projectRoot: projectDir,
      permissionMode: "auto",
    };

    try {
      const bashCalls: Array<{ command: string; cwd: string }> = [];
      const tools = createShellAndFsNativeTools({
        runBash: async (args) => {
          bashCalls.push(args);
          return { output: "echoed", exitCode: 0, cwd: args.cwd, executionId: "exec-1" };
        },
      });

      expect(tools.map((t) => t.name)).toEqual([
        "bash",
        "delete",
        "move",
        "project-rule-write",
      ]);

      const byName = Object.fromEntries(tools.map((t) => [t.name, t]));

      // 1. bash
      const bashRes = await byName["bash"]!.execute({ command: "ls -la" }, ctx) as any;
      expect(bashRes.output).toBe("echoed");
      expect(bashCalls[0]?.command).toBe("ls -la");

      // 2. move
      const srcFile = join(projectDir, "a.txt");
      const dstFile = join(projectDir, "b.txt");
      writeFileSync(srcFile, "hello world", "utf-8");
      const moveRes = await byName["move"]!.execute({ source: "a.txt", destination: "b.txt" }, ctx) as any;
      expect(moveRes.success).toBe(true);
      expect(readFileSync(dstFile, "utf-8")).toBe("hello world");

      // 3. delete
      const delRes = await byName["delete"]!.execute({ path: "b.txt" }, ctx) as any;
      expect(delRes.success).toBe(true);

      // 4. project-rule-write
      const ruleRes = await byName["project-rule-write"]!.execute({
        name: "test-rule",
        description: "Test rule description",
        body: "Test rule body content",
        mode: "create",
      }, ctx) as any;
      expect(ruleRes.success).toBe(true);
      const ruleFile = join(projectDir, ".prismnext/agent/rules/test-rule/RULE.md");
      expect(readFileSync(ruleFile, "utf-8")).toContain("name: test-rule");
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("registers shell and fs tools in Pi Lab and Pi native catalog", () => {
    const labNames = createPiLabNativeTools().map((t) => t.name);
    expect(labNames).toContain("bash");
    expect(labNames).toContain("delete");
    expect(labNames).toContain("move");
    expect(labNames).toContain("project-rule-write");

    const ctx: ToolExecuteContext = {
      runtimeSessionId: "rt-lab-1",
      tabId: "pi-lab",
      turnId: "turn-1",
      toolCallId: "call-1",
      projectRoot: "/tmp/lab-project",
      permissionMode: "auto",
    };
    const piNames = createPiNativeTools({
      toolHost: { execute: async () => ({ ok: true }) },
      getContext: () => ctx,
    }).map((t) => t.name);
    expect(piNames).toContain("bash");
    expect(piNames).toContain("delete");
    expect(piNames).toContain("move");
    expect(piNames).toContain("project-rule-write");
  });
});
