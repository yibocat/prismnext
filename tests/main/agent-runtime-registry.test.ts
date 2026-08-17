import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { RuntimeRegistry } from "../../src/main/agent/runtime-registry";
import { AgentSessionStore, resolvePiRuntimeSessionDir } from "../../src/main/agent/session-store";
import type { AgentRuntime } from "../../src/main/agent/runtime";
import type { CreateSessionInput, CreateSessionResult, RuntimeSessionId, TurnInput } from "../../src/shared/agent-runtime";

function fakeRuntime(label: string): AgentRuntime & { disposed: string[] } {
  const disposed: string[] = [];
  return {
    disposed,
    async createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
      return {
        runtimeSessionId: `rt-${label}`,
        tabId: input.tabId,
      };
    },
    async sendTurn(_input: TurnInput): Promise<void> {},
    async cancelTurn(_id: RuntimeSessionId): Promise<void> {},
    async disposeSession(id: RuntimeSessionId): Promise<void> {
      disposed.push(id);
    },
    subscribe() {
      return () => {};
    },
  };
}

describe("RuntimeRegistry", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    dirs.length = 0;
  });

  it("gives two conversations distinct runtime and permission bindings", async () => {
    const userData = mkdtempSync(join(tmpdir(), "prism-reg-"));
    const project = mkdtempSync(join(tmpdir(), "prism-reg-proj-"));
    dirs.push(userData, project);
    writeFileSync(join(project, "README.md"), "keep", "utf-8");

    const started: string[] = [];
    const registry = new RuntimeRegistry({
      userDataDir: userData,
      store: new AgentSessionStore(join(userData, "pi-agent")),
      startRuntime: async (input) => {
        started.push(input.conversationId);
        return {
          runtime: fakeRuntime(input.conversationId),
          runtimeSessionId: `rt-${input.conversationId}`,
          piSessionFile: join(resolvePiRuntimeSessionDir(userData), `${input.conversationId}.jsonl`),
        };
      },
    });

    const a = await registry.createConversation({
      tabId: "tab-a",
      projectRoot: project,
    });
    const b = await registry.createConversation({
      tabId: "tab-b",
      projectRoot: project,
    });

    expect(a.conversationId).not.toBe(b.conversationId);
    expect(a.runtimeSessionId).not.toBe(b.runtimeSessionId);
    expect(a.backend).toBe("pi");
    expect(started).toEqual([a.conversationId, b.conversationId]);
    expect(registry.getBinding(a.conversationId)?.runtimeSessionId).toBe(a.runtimeSessionId);
    expect(existsSync(join(project, ".pi"))).toBe(false);
    expect(existsSync(join(project, ".agents"))).toBe(false);
    expect(existsSync(join(project, ".opencode"))).toBe(false);
  });

  it("dispose drops the live handle but keeps the product record and Pi session file", async () => {
    const userData = mkdtempSync(join(tmpdir(), "prism-reg-"));
    const project = mkdtempSync(join(tmpdir(), "prism-reg-proj-"));
    dirs.push(userData, project);

    const sessionDir = resolvePiRuntimeSessionDir(userData);
    mkdirSync(sessionDir, { recursive: true });
    const runtime = fakeRuntime("keep");
    const registry = new RuntimeRegistry({
      userDataDir: userData,
      store: new AgentSessionStore(join(userData, "pi-agent")),
      startRuntime: async (input) => {
        const piSessionFile = join(sessionDir, `${input.conversationId}.jsonl`);
        writeFileSync(piSessionFile, '{"type":"session"}\n', "utf-8");
        return {
          runtime,
          runtimeSessionId: "rt-keep",
          piSessionFile,
        };
      },
    });

    const created = await registry.createConversation({
      conversationId: "conv-keep",
      tabId: "tab-1",
      projectRoot: project,
    });
    expect(created.piSessionFile).toBeTruthy();
    await registry.disposeConversation(created.conversationId);

    expect(runtime.disposed).toEqual(["rt-keep"]);
    expect(registry.getBinding(created.conversationId)).toBeNull();
    const stored = registry.store.getByConversationId("conv-keep");
    expect(stored?.conversationId).toBe("conv-keep");
    expect(stored?.piSessionFile).toBe(created.piSessionFile);
    expect(existsSync(created.piSessionFile!)).toBe(true);

    const reopened = await registry.openConversation({
      conversationId: "conv-keep",
      tabId: "tab-2",
      projectRoot: project,
    });
    expect(reopened.conversationId).toBe("conv-keep");
    expect(reopened.piSessionFile).toBe(created.piSessionFile);
    expect(reopened.tabId).toBe("tab-2");
  });
});
