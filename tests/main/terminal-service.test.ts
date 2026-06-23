import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: () => "/tmp/prism-terminal-test-userdata",
  },
}));

const mockKill = vi.fn();
const mockWrite = vi.fn();
const mockResize = vi.fn();
let onDataCb: ((data: string) => void) | null = null;
let onExitCb: ((args: { exitCode: number }) => void) | null = null;

vi.mock("node-pty", () => ({
  spawn: vi.fn(() => {
    onDataCb = null;
    onExitCb = null;
    return {
      pid: 4242,
      onData: (cb: (data: string) => void) => {
        onDataCb = cb;
      },
      onExit: (cb: (args: { exitCode: number }) => void) => {
        onExitCb = cb;
      },
      write: mockWrite,
      resize: mockResize,
      kill: mockKill,
    };
  }),
}));

import {
  createSession,
  destroySession,
  destroySessionsByPrefix,
  destroySessionsByTabIds,
  destroyAllSessions,
  _getSessionCountForTests,
  _resetSessionsForTests,
  _getSessionForTests,
} from "../../src/main/services/terminal";

function spawnSession(
  sessionId: string,
  tabId: string,
  projectRoot = "/proj",
  cwd = "/proj",
) {
  return createSession({
    sessionId,
    tabId,
    projectRoot,
    cwd,
    onData: vi.fn(),
    onExit: vi.fn(),
  });
}

describe("terminal service", () => {
  beforeEach(() => {
    _resetSessionsForTests();
    mockKill.mockClear();
    mockWrite.mockClear();
    mockResize.mockClear();
  });

  it("creates a session with metadata", () => {
    const meta = spawnSession("tab-1:0", "tab-1");
    expect(meta).toEqual({
      shell: expect.any(String),
      cwd: "/proj",
      pid: 4242,
      tabId: "tab-1",
    });
    expect(_getSessionCountForTests()).toBe(1);
    const session = _getSessionForTests("tab-1:0");
    expect(session?.status).toBe("running");
    expect(session?.tabId).toBe("tab-1");
    expect(session?.projectRoot).toBe("/proj");
  });

  it("replaces duplicate sessionId on recreate", () => {
    spawnSession("tab-1:0", "tab-1");
    spawnSession("tab-1:0", "tab-1");
    expect(mockKill).toHaveBeenCalledTimes(1);
    expect(_getSessionCountForTests()).toBe(1);
  });

  it("destroys sessions by tab prefix only", () => {
    spawnSession("tab-1:0", "tab-1");
    spawnSession("tab-1:1", "tab-1");
    spawnSession("tab-2:0", "tab-2");

    destroySessionsByPrefix("tab-1:");
    expect(_getSessionCountForTests()).toBe(1);
    expect(_getSessionForTests("tab-2:0")).toBeDefined();
    expect(mockKill).toHaveBeenCalledTimes(2);
  });

  it("destroys sessions by tab ids batch", () => {
    spawnSession("tab-1:0", "tab-1");
    spawnSession("tab-2:0", "tab-2");
    spawnSession("tab-3:0", "tab-3");

    destroySessionsByTabIds(["tab-1", "tab-3"]);
    expect(_getSessionCountForTests()).toBe(1);
    expect(_getSessionForTests("tab-2:0")).toBeDefined();
  });

  it("destroySession is idempotent", () => {
    spawnSession("tab-1:0", "tab-1");
    destroySession("tab-1:0");
    destroySession("tab-1:0");
    expect(_getSessionCountForTests()).toBe(0);
    expect(mockKill).toHaveBeenCalledTimes(1);
  });

  it("destroyAllSessions is idempotent", () => {
    spawnSession("tab-1:0", "tab-1");
    spawnSession("tab-2:0", "tab-2");
    destroyAllSessions();
    destroyAllSessions();
    expect(_getSessionCountForTests()).toBe(0);
    expect(mockKill).toHaveBeenCalledTimes(2);
  });

  it("marks session exited on pty exit", () => {
    spawnSession("tab-1:0", "tab-1");
    onExitCb?.({ exitCode: 0 });
    expect(_getSessionCountForTests()).toBe(0);
  });
});
