import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_NATIVE_TOOLS } from "../../src/main/agent/tools/index";
import {
  HOST_CUSTOM_TOOL_CAPABILITIES,
  PI_PRIMITIVE_TOOL_NAMES,
  PI_PRIMITIVE_TOOLS,
  isPiPrimitiveToolName,
} from "../../src/main/agent/capability-matrix";
import { AGENT_EVENT_TYPES } from "../../src/shared/agent-runtime";

const REPO = join(__dirname, "../..");

describe("agent capability baseline", () => {
  it("keeps Pi primitives out of the host custom catalog", () => {
    expect(PI_PRIMITIVE_TOOLS).toHaveLength(PI_PRIMITIVE_TOOL_NAMES.length);
    for (const name of PI_PRIMITIVE_TOOL_NAMES) {
      expect(isPiPrimitiveToolName(name)).toBe(true);
      expect(ALL_NATIVE_TOOLS.some((tool) => tool.name === name)).toBe(false);
    }
  });

  it("covers every host custom tool name exactly once", () => {
    const fromRegistry = new Set(ALL_NATIVE_TOOLS.map((tool) => tool.name));
    const fromMatrix = new Set(HOST_CUSTOM_TOOL_CAPABILITIES.map((row) => row.name));
    expect(fromMatrix).toEqual(fromRegistry);
    expect(fromMatrix.size).toBe(ALL_NATIVE_TOOLS.length);
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
