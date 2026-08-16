import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUILTIN_TOOLS } from "../../src/main/tools/index";
import {
  BUILTIN_TOOL_CAPABILITIES,
  OPENCODE_BUILTIN_REBUILD,
} from "../../src/main/agent/capability-matrix";
import { ALL_TOOL_NAMES } from "../../src/shared/tool-names";
import { AGENT_EVENT_TYPES } from "../../src/shared/agent-runtime";

const REPO = join(__dirname, "../..");

describe("agent capability baseline", () => {
  it("freezes exactly 29 built-in tools", () => {
    expect(BUILTIN_TOOLS).toHaveLength(29);
    expect(ALL_TOOL_NAMES).toHaveLength(29);
    expect(BUILTIN_TOOL_CAPABILITIES).toHaveLength(29);
  });

  it("covers every built-in tool name exactly once", () => {
    const fromRegistry = new Set(BUILTIN_TOOLS.map((tool) => tool.name));
    const fromMatrix = new Set(BUILTIN_TOOL_CAPABILITIES.map((row) => row.name));
    expect(fromMatrix).toEqual(fromRegistry);
    expect(fromMatrix.size).toBe(29);
  });

  it("keeps OpenCode builtins on a separate rebuild list", () => {
    const builtin = new Set(BUILTIN_TOOLS.map((tool) => tool.name));
    for (const row of OPENCODE_BUILTIN_REBUILD) {
      expect(builtin.has(row.name)).toBe(false);
      expect(row.kind).toBe("opencode_builtin_rebuild");
    }
  });

  it("does not expose ACP part or OpenCode Task types on AgentEvent", () => {
    expect(AGENT_EVENT_TYPES).not.toContain("part");
    expect(AGENT_EVENT_TYPES).not.toContain("Task");
    expect(AGENT_EVENT_TYPES).not.toContain("session/update");
    expect(AGENT_EVENT_TYPES).toContain("text_delta");
    expect(AGENT_EVENT_TYPES).toContain("permission_requested");
    expect(AGENT_EVENT_TYPES).toContain("turn_cancelled");
  });

  it("leaves production chat on the existing runtime", () => {
    const chat = readFileSync(join(REPO, "src/main/ipc/chat.ts"), "utf-8");
    expect(chat).not.toMatch(/from ["'].*main\/agent/);
    expect(chat).toMatch(/AcpService|createSession/);
  });
});
