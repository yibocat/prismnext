import { beforeEach, describe, expect, it, vi } from "vitest";

const warn = vi.fn();

vi.mock("../../src/main/services/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: (...args: unknown[]) => warn(...args),
    error: vi.fn(),
  }),
}));

import {
  PermissionGate,
  classifyHardDeny,
  type PermissionGateRequest,
} from "../../src/main/agent/permission-gate";

const ROOT = "/Users/me/paper-project";

function makeRequest(overrides: Partial<PermissionGateRequest>): PermissionGateRequest {
  return {
    requestId: "req-1",
    runtimeSessionId: "session-1",
    tabId: "tab-1",
    turnId: "turn-1",
    toolCallId: "call-1",
    toolName: "bash",
    args: {},
    projectRoot: ROOT,
    permissionMode: "auto",
    ...overrides,
  };
}

describe("classifyHardDeny", () => {
  it("labels bash pdflatex as latex", () => {
    expect(
      classifyHardDeny(
        { toolName: "bash", bashCommand: "pdflatex main.tex" },
        "prismnext: do not compile LaTeX",
      ),
    ).toBe("latex");
  });

  it("labels whole-disk search", () => {
    expect(
      classifyHardDeny(
        { toolName: "bash", bashCommand: "mdfind -name '*.tex'" },
        "whole-disk search",
      ),
    ).toBe("whole_disk");
  });

  it("labels path escape as outside_project", () => {
    expect(
      classifyHardDeny(
        { toolName: "delete", bashCommand: null },
        "outside_project:/etc/passwd",
      ),
    ).toBe("outside_project");
  });
});

describe("PermissionGate hard deny logging", () => {
  beforeEach(() => {
    warn.mockReset();
  });

  it("logs permission.hard_deny for bash pdflatex without the command text", async () => {
    const gate = new PermissionGate();
    const result = await gate.decide(
      makeRequest({ bashCommand: "pdflatex main.tex", bashCwd: ROOT }),
    );
    expect(result.decision).toBe("deny");
    expect(warn).toHaveBeenCalledWith(
      "permission.hard_deny",
      expect.objectContaining({
        toolName: "bash",
        code: "latex",
        runtimeSessionId: "session-1",
        toolCallId: "call-1",
      }),
    );
    const detail = warn.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(JSON.stringify(detail)).not.toContain("pdflatex main.tex");
  });

  it("does not log on a normal allow", async () => {
    const gate = new PermissionGate();
    const result = await gate.decide(
      makeRequest({ bashCommand: "ls -la", bashCwd: ROOT }),
    );
    expect(result.decision).toBe("allow");
    expect(warn).not.toHaveBeenCalled();
  });

  it("logs permission.readonly_mode when readonly blocks a write", async () => {
    const gate = new PermissionGate();
    const result = await gate.decide(
      makeRequest({
        toolName: "write",
        filePath: "notes.md",
        permissionMode: "readonly",
      }),
    );
    expect(result.decision).toBe("deny");
    expect(warn).toHaveBeenCalledWith(
      "permission.readonly_mode",
      expect.objectContaining({ toolName: "write" }),
    );
  });

  it("logs permission.user_deny_rule without the command text", async () => {
    const gate = new PermissionGate();
    const result = await gate.decide(
      makeRequest({
        bashCommand: "rm -rf build",
        bashCwd: ROOT,
        rules: {
          allowedPaths: [],
          allowRules: [],
          denyRules: [{ toolName: "bash", pattern: null, raw: "bash", line: 1 }],
          bashAllowAlwaysPatterns: [],
          toolAllowAlways: [],
        },
      }),
    );
    expect(result.decision).toBe("deny");
    expect(result.reason).toBe("user_deny_rule");
    expect(warn).toHaveBeenCalledWith(
      "permission.user_deny_rule",
      expect.objectContaining({ toolName: "bash" }),
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain("rm -rf build");
  });
});
