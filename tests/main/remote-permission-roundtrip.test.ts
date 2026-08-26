import { Type } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { PermissionGate } from "../../src/main/agent/permission-gate";
import { ToolHost } from "../../src/main/agent/tool-host";
import type { NativeToolDefinition } from "../../src/main/agent/tools/types";

const touch: NativeToolDefinition = {
  name: "write",
  label: "Touch",
  description: "Write a marker",
  parameters: Type.Object({}),
  permission: { category: "safe_write" },
  execute: async () => ({ ok: true, wrote: true }),
};

function ctx(toolCallId: string) {
  return {
    runtimeSessionId: "rt",
    tabId: "tab",
    turnId: "t1",
    toolCallId,
    projectRoot: "/tmp/paper",
    permissionMode: "ask" as const,
  };
}

describe("remote permission roundtrip", () => {
  it("allow runs the tool; deny leaves no side effect", async () => {
    const prompted: string[] = [];
    const gate = new PermissionGate({
      timeoutMs: 5_000,
      onPrompt: (request) => {
        prompted.push(request.requestId);
      },
    });
    const host = new ToolHost({ gate });
    host.register(touch);

    const allowed = host.execute("write", {}, ctx("call-allow"));
    expect(prompted).toHaveLength(1);
    expect(gate.resolve(prompted[0]!, "allow")).toBe(true);
    await expect(allowed).resolves.toMatchObject({ ok: true, result: { wrote: true } });

    const denied = host.execute("write", {}, ctx("call-deny"));
    expect(prompted).toHaveLength(2);
    expect(gate.resolve(prompted[1]!, "deny")).toBe(true);
    await expect(denied).resolves.toMatchObject({ ok: false, denied: true });
  });
});
