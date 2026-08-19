import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PiSdkRuntime } from "../../src/main/agent/pi-sdk-runtime";
import { AgentSessionStore } from "../../src/main/agent/session-store";
import { hydrateSessionRecordToConversation } from "../../src/main/agent/session-hydrator";
import { ToolHost } from "../../src/main/agent/tool-host";
import { PermissionGate } from "../../src/main/agent/permission-gate";
import type { PiLikeSessionEvent } from "../../src/main/agent/events";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("PiSdkRuntime persist assistant.blocks", () => {
  it("writes event-order blocks so reopen matches the live fold tree", async () => {
    const project = mkdtempSync(join(tmpdir(), "prism-pi-blocks-"));
    const storeRoot = mkdtempSync(join(tmpdir(), "prism-pi-blocks-store-"));
    dirs.push(project, storeRoot);
    const store = new AgentSessionStore(storeRoot);

    let emitPi: ((event: PiLikeSessionEvent) => void) | null = null;
    const runtime = new PiSdkRuntime({
      store,
      toolHost: new ToolHost({ gate: new PermissionGate() }),
      gate: new PermissionGate(),
      agentDir: join(storeRoot, "pi-agent"),
      createPiSession: async () => ({
        sessionId: "pi-blocks-session",
        subscribe(next: (event: PiLikeSessionEvent) => void) {
          emitPi = next;
          return () => {
            emitPi = null;
          };
        },
        async prompt() {
          emitPi?.({
            type: "message_update",
            assistantMessageEvent: { type: "thinking_delta", delta: "先看目录" },
          });
          emitPi?.({
            type: "tool_execution_start",
            toolCallId: "c-ls",
            toolName: "ls",
            args: { path: "." },
          });
          emitPi?.({
            type: "tool_execution_end",
            toolCallId: "c-ls",
            toolName: "ls",
            result: "main.tex\n",
          });
          emitPi?.({
            type: "message_update",
            assistantMessageEvent: { type: "thinking_delta", delta: "再找 tex" },
          });
          emitPi?.({
            type: "message_update",
            assistantMessageEvent: { type: "text_delta", delta: "找到 main.tex" },
          });
          emitPi?.({ type: "agent_end" });
        },
        async abort() {},
        dispose() {},
      }),
    });

    const session = await runtime.createSession({ tabId: "tab-blocks", projectRoot: project });
    await runtime.sendTurn({
      runtimeSessionId: session.runtimeSessionId,
      tabId: "tab-blocks",
      text: "列出项目再找 tex",
      permissionMode: "edit_auto",
    });

    const record = store.getSession(session.runtimeSessionId);
    const turn = record?.turns[0];
    expect(turn?.assistant.blocks?.map((block) => block.type)).toEqual([
      "thinking",
      "tool_use",
      "tool_result",
      "thinking",
      "text",
    ]);
    expect(turn?.assistant.thinking).toBe("先看目录再找 tex");
    expect(turn?.assistant.text).toBe("找到 main.tex");
    expect(turn?.assistant.toolCalls).toHaveLength(1);

    const conv = hydrateSessionRecordToConversation(record!);
    expect(conv.turns[0]?.assistant.blocks.map((block) => block.type)).toEqual([
      "thinking",
      "tool_use",
      "tool_result",
      "thinking",
      "text",
    ]);
  });

  it("writes user attachments onto the persisted turn so reopen still has them", async () => {
    const project = mkdtempSync(join(tmpdir(), "prism-pi-att-"));
    const storeRoot = mkdtempSync(join(tmpdir(), "prism-pi-att-store-"));
    dirs.push(project, storeRoot);
    const store = new AgentSessionStore(storeRoot);

    let emitPi: ((event: PiLikeSessionEvent) => void) | null = null;
    const runtime = new PiSdkRuntime({
      store,
      toolHost: new ToolHost({ gate: new PermissionGate() }),
      gate: new PermissionGate(),
      agentDir: join(storeRoot, "pi-agent"),
      createPiSession: async () => ({
        sessionId: "pi-att-session",
        subscribe(next: (event: PiLikeSessionEvent) => void) {
          emitPi = next;
          return () => {
            emitPi = null;
          };
        },
        async prompt() {
          emitPi?.({
            type: "message_update",
            assistantMessageEvent: { type: "text_delta", delta: "收到图" },
          });
          emitPi?.({ type: "agent_end" });
        },
        async abort() {},
        dispose() {},
      }),
    });

    const session = await runtime.createSession({ tabId: "tab-att", projectRoot: project });
    const attachments = [{ name: "fig.png", kind: "image" as const, path: "/tmp/fig.png" }];
    await runtime.sendTurn({
      runtimeSessionId: session.runtimeSessionId,
      tabId: "tab-att",
      text: "看这张图",
      permissionMode: "edit_auto",
      attachments,
    });

    const record = store.getSession(session.runtimeSessionId);
    expect(record?.turns[0]?.user.attachments).toEqual(attachments);
    const conv = hydrateSessionRecordToConversation(record!);
    expect(conv.turns[0]?.user.blocks[0]).toMatchObject({
      type: "text",
      text: "看这张图",
      attachments,
    });
  });
});
