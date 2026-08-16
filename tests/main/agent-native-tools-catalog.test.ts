import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  ALL_NATIVE_TOOLS,
  getNativeToolByName,
  LITERATURE_TOOLS,
  LATEX_TOOLS,
  RESEARCH_BRIEF_TOOLS,
  EXPERIMENT_TOOLS,
  INTERACTION_TOOLS,
  SYSTEM_TOOLS,
  INTERACTIVE_TOOLS,
} from "../../src/main/agent/tools/index";
import { createPiLabNativeTools } from "../../src/main/agent/pi-lab-service";
import { createPiNativeTools } from "../../src/main/agent/pi-sdk-runtime";
import { ToolHost, type ToolExecuteContext } from "../../src/main/agent/tool-host";
import { PermissionGate } from "../../src/main/agent/permission-gate";

describe("unified native tools catalog", () => {
  const ctx: ToolExecuteContext = {
    runtimeSessionId: "rt-lab-1",
    tabId: "pi-lab",
    turnId: "turn-1",
    toolCallId: "call-1",
    projectRoot: "/tmp/lab-project",
    permissionMode: "auto",
  };

  it("exports exactly 29 unique self-describing native tools", () => {
    expect(ALL_NATIVE_TOOLS).toHaveLength(29);
    const names = new Set(ALL_NATIVE_TOOLS.map((t) => t.name));
    expect(names.size).toBe(29);

    expect(LITERATURE_TOOLS).toHaveLength(10);
    expect(LATEX_TOOLS).toHaveLength(2);
    expect(RESEARCH_BRIEF_TOOLS).toHaveLength(2);
    expect(EXPERIMENT_TOOLS).toHaveLength(4);
    expect(INTERACTION_TOOLS).toHaveLength(4);
    expect(SYSTEM_TOOLS).toHaveLength(5);
    expect(INTERACTIVE_TOOLS).toHaveLength(2);

    for (const tool of ALL_NATIVE_TOOLS) {
      expect(tool.name).toBeTruthy();
      expect(tool.label).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.parameters).toBeTruthy();
      expect(tool.permission).toBeTruthy();
      expect(typeof tool.execute).toBe("function");
    }
  });

  it("looks up native tools by name case-insensitively", () => {
    expect(getNativeToolByName("literature-search")?.name).toBe("literature-search");
    expect(getNativeToolByName("BASH")?.name).toBe("bash");
    expect(getNativeToolByName("Latex-Compile")?.name).toBe("latex-compile");
    expect(getNativeToolByName("non-existent")).toBeUndefined();
  });

  it("registers all 29 tools in ToolHost and generates dynamic Pi tools without hardcoding", () => {
    const gate = new PermissionGate();
    const toolHost = new ToolHost({ gate });
    toolHost.registerAll(ALL_NATIVE_TOOLS);

    expect(toolHost.names()).toHaveLength(29);

    const piTools = toolHost.toPiTools(() => ctx);
    expect(piTools).toHaveLength(29);
    for (const pt of piTools) {
      expect(pt.name).toBeTruthy();
      expect(pt.description).toBeTruthy();
      expect(pt.parameters).toBeTruthy();
      expect(typeof pt.execute).toBe("function");
    }

    const labTools = createPiLabNativeTools();
    expect(labTools).toHaveLength(29);

    const piNative = createPiNativeTools({
      toolHost,
      getContext: () => ctx,
    });
    expect(piNative).toHaveLength(29);
  });

  it("executes system and fs tools in-memory with real file operations", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "prism-native-tools-test-"));
    const localCtx: ToolExecuteContext = {
      ...ctx,
      projectRoot: projectDir,
    };

    try {
      const deleteTool = getNativeToolByName("delete")!;
      const moveTool = getNativeToolByName("move")!;
      const ruleWriteTool = getNativeToolByName("project-rule-write")!;

      // 1. Move
      const srcFile = join(projectDir, "test-a.txt");
      const dstFile = join(projectDir, "test-b.txt");
      writeFileSync(srcFile, "hello architecture", "utf-8");
      const moveRes = await moveTool.execute({ source: "test-a.txt", destination: "test-b.txt" }, localCtx) as any;
      expect(moveRes.success).toBe(true);
      expect(readFileSync(dstFile, "utf-8")).toBe("hello architecture");

      // 2. Delete
      const delRes = await deleteTool.execute({ path: "test-b.txt" }, localCtx) as any;
      expect(delRes.success).toBe(true);

      // 3. Rule write
      const ruleRes = await ruleWriteTool.execute({
        name: "clean-arch",
        description: "Enforce clean architecture",
        body: "All tools must be self-describing.",
        mode: "create",
      }, localCtx) as any;
      expect(ruleRes.success).toBe(true);
      const rulePath = join(projectDir, ".prismnext/agent/rules/clean-arch/RULE.md");
      expect(readFileSync(rulePath, "utf-8")).toContain("name: clean-arch");
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });
});
