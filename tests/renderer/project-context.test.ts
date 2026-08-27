import { describe, expect, it, vi } from "vitest";
import {
  applyProjectPick,
  applySessionActivate,
  type ProjectContextDeps,
} from "../../src/renderer/lib/workspace/project-context";

function deps(overrides: Partial<ProjectContextDeps> = {}): ProjectContextDeps {
  return {
    assignSessionToProjectPath: vi.fn(async () => true),
    openRemoteWorkbenchProject: vi.fn(async () => true),
    joinWorkbenchFolder: vi.fn(async () => true),
    focusProject: vi.fn(async () => undefined),
    findMemberByPath: vi.fn(() => null),
    inspectConversation: vi.fn(() => ({ isStreaming: false, hasTurns: false })),
    recordSessionProject: vi.fn(),
    loadSession: vi.fn(async () => undefined),
    newSession: vi.fn(),
    ...overrides,
  };
}

describe("applyProjectPick", () => {
  it("assigns an empty chat to a local workbench path", async () => {
    const host = deps({
      findMemberByPath: vi.fn(() => ({ id: "p_a", lastPath: "/papers/a" })),
    });
    await expect(applyProjectPick({
      path: "/papers/a",
      mode: "assign",
      conversationId: "conv-1",
    }, host)).resolves.toEqual({ ok: true });
    expect(host.assignSessionToProjectPath).toHaveBeenCalledWith("conv-1", "/papers/a");
    expect(host.joinWorkbenchFolder).not.toHaveBeenCalled();
    expect(host.openRemoteWorkbenchProject).not.toHaveBeenCalled();
    expect(host.newSession).not.toHaveBeenCalled();
  });

  it("opens a remote folder then assigns the empty chat", async () => {
    const host = deps();
    await expect(applyProjectPick({
      path: "remote://lab/home/u/b",
      mode: "assign",
      conversationId: "conv-1",
    }, host)).resolves.toEqual({ ok: true });
    expect(host.openRemoteWorkbenchProject).toHaveBeenCalledWith("lab", "/home/u/b");
    expect(host.assignSessionToProjectPath).toHaveBeenCalledWith(
      "conv-1",
      "remote://lab/home/u/b",
    );
    expect(host.joinWorkbenchFolder).not.toHaveBeenCalled();
  });

  it("focuses an existing member without opening a new session", async () => {
    const host = deps({
      findMemberByPath: vi.fn(() => ({
        id: "p_b",
        lastPath: "remote://lab/home/u/b",
      })),
    });
    await expect(applyProjectPick({
      path: "remote:/lab/home/u/b",
      mode: "focus",
    }, host)).resolves.toEqual({ ok: true });
    expect(host.focusProject).toHaveBeenCalledWith("remote://lab/home/u/b", {
      connectRemote: false,
    });
    expect(host.newSession).not.toHaveBeenCalled();
    expect(host.assignSessionToProjectPath).not.toHaveBeenCalled();
  });

  it("refuses assign when the chat already has turns", async () => {
    const host = deps({
      inspectConversation: vi.fn(() => ({ isStreaming: false, hasTurns: true })),
    });
    await expect(applyProjectPick({
      path: "/papers/b",
      mode: "assign",
      conversationId: "conv-1",
    }, host)).resolves.toEqual({ ok: false, reason: "session_not_empty" });
    expect(host.assignSessionToProjectPath).not.toHaveBeenCalled();
  });
});

describe("applySessionActivate", () => {
  it("records the project, focuses, then loads the session", async () => {
    const host = deps();
    await applySessionActivate({
      conversationId: "conv-1",
      projectId: "p_B",
      lastPath: "remote://lab/home/u/b",
    }, host);
    expect(host.recordSessionProject).toHaveBeenCalledWith("conv-1", "p_B");
    expect(host.focusProject).toHaveBeenCalledWith("remote://lab/home/u/b", {
      connectRemote: false,
    });
    expect(host.loadSession).toHaveBeenCalledWith(
      "conv-1",
      undefined,
      "remote://lab/home/u/b",
      { connectRemote: false },
    );
  });
});
