import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  PermissionGate,
  evaluateHardDeny,
  type PermissionGateRequest,
} from "../../src/main/agent/permission-gate";
import { buildPermissionRulesConfig } from "../../src/shared/smart-permission-policy";

const ROOT = "/Users/me/paper-project";

function makeRequest(overrides: Partial<PermissionGateRequest>): PermissionGateRequest {
  return {
    requestId: "req-1",
    runtimeSessionId: "session-1",
    tabId: "tab-1",
    turnId: "turn-1",
    toolCallId: "call-1",
    toolName: "literature-search",
    args: {},
    projectRoot: ROOT,
    permissionMode: "ask",
    ...overrides,
  };
}

describe("PermissionGate Hard Deny Security Invariants", () => {
  it("hard denies whole-disk search commands (mdfind / locate)", () => {
    const req = makeRequest({
      toolName: "bash",
      bashCommand: "mdfind -name '*.tex'",
      bashCwd: ROOT,
    });
    const result = evaluateHardDeny(req);
    expect(result.deny).toBe(true);
    if (result.deny) {
      expect(result.reason).toContain("whole-disk search");
    }
  });

  it("hard denies whole-disk path escaping commands (find /)", () => {
    const req = makeRequest({
      toolName: "bash",
      bashCommand: "find / -name '*.tex'",
      bashCwd: ROOT,
    });
    const result = evaluateHardDeny(req);
    expect(result.deny).toBe(true);
    if (result.deny) {
      expect(result.reason).toContain("outside_project:/");
    }
  });

  it("hard denies direct bare LaTeX compilation commands in bash", () => {
    const req = makeRequest({
      toolName: "bash",
      bashCommand: "pdflatex main.tex",
      bashCwd: ROOT,
    });
    const result = evaluateHardDeny(req);
    expect(result.deny).toBe(true);
    if (result.deny) {
      expect(result.reason).toContain("latex-compile");
    }
  });

  it("hard denies project escaping paths for mutating and shell tools", () => {
    const req = makeRequest({
      toolName: "delete",
      filePath: "/etc/passwd",
    });
    const result = evaluateHardDeny(req);
    expect(result.deny).toBe(true);
    if (result.deny) {
      expect(result.reason).toContain("outside_project");
    }
  });

  it("allows paths under explicit allowedPaths whitelist", () => {
    const req = makeRequest({
      toolName: "delete",
      filePath: "/tmp/shared/temp.tex",
      allowedPaths: ["/tmp/shared"],
    });
    const result = evaluateHardDeny(req);
    expect(result.deny).toBe(false);
  });
});

describe("PermissionGate 4 Permission Modes Matrix", () => {
  it("readonly mode: allows read_only tools, blocks all mutations and shell execution", async () => {
    const gate = new PermissionGate();

    // 1. read_only tool: allowed
    const readReq = makeRequest({
      toolName: "literature-search",
      permissionMode: "readonly",
    });
    const readRes = await gate.decide(readReq);
    expect(readRes.decision).toBe("allow");

    // 2. safe_write tool: denied
    const writeReq = makeRequest({
      toolName: "research-brief-update",
      permissionMode: "readonly",
      filePath: ".brief.md",
    });
    const writeRes = await gate.decide(writeReq);
    expect(writeRes.decision).toBe("deny");

    // 3. destructive tool: denied
    const delReq = makeRequest({
      toolName: "delete",
      permissionMode: "readonly",
      filePath: "unused.tex",
    });
    const delRes = await gate.decide(delReq);
    expect(delRes.decision).toBe("deny");

    // 4. shell_exec tool: denied
    const bashReq = makeRequest({
      toolName: "bash",
      permissionMode: "readonly",
      bashCommand: "ls -la",
    });
    const bashRes = await gate.decide(bashReq);
    expect(bashRes.decision).toBe("deny");
  });

  it("auto mode: allows safe, destructive, and shell tools as long as not Hard Deny", async () => {
    const gate = new PermissionGate();

    const bashReq = makeRequest({
      toolName: "bash",
      permissionMode: "auto",
      bashCommand: "ls -la",
      bashCwd: ROOT,
    });
    const bashRes = await gate.decide(bashReq);
    expect(bashRes.decision).toBe("allow");

    const delReq = makeRequest({
      toolName: "delete",
      permissionMode: "auto",
      filePath: "draft.tex",
    });
    const delRes = await gate.decide(delReq);
    expect(delRes.decision).toBe("allow");
  });

  it("edit_auto mode: allows read and safe_write, prompts for destructive and shell", async () => {
    const prompted: PermissionGateRequest[] = [];
    const gate = new PermissionGate({
      onPrompt: (req) => {
        prompted.push(req);
        // auto approve in test
        gate.resolve(req.requestId, "allow");
      },
    });

    // 1. read_only tool: allowed immediately without prompt
    const readRes = await gate.decide(makeRequest({
      toolName: "literature-read",
      permissionMode: "edit_auto",
    }));
    expect(readRes.decision).toBe("allow");
    expect(prompted).toHaveLength(0);

    // 2. safe_write tool: allowed without prompt
    const writeRes = await gate.decide(makeRequest({
      toolName: "research-brief-update",
      permissionMode: "edit_auto",
      filePath: ".brief.md",
    }));
    expect(writeRes.decision).toBe("allow");
    expect(prompted).toHaveLength(0);

    // 3. destructive tool (delete): prompts
    const delRes = await gate.decide(makeRequest({
      requestId: "del-req",
      toolName: "delete",
      permissionMode: "edit_auto",
      filePath: "trash.tex",
    }));
    expect(delRes.decision).toBe("allow");
    expect(prompted).toHaveLength(1);
    expect(prompted[0]?.requestId).toBe("del-req");

    // 4. shell tool (bash): prompts
    const bashRes = await gate.decide(makeRequest({
      requestId: "bash-req",
      toolName: "bash",
      permissionMode: "edit_auto",
      bashCommand: "make build",
      bashCwd: ROOT,
    }));
    expect(bashRes.decision).toBe("allow");
    expect(prompted).toHaveLength(2);
  });

  it("ask mode: allows read_only, prompts for safe_write, destructive, and shell", async () => {
    const prompted: PermissionGateRequest[] = [];
    const gate = new PermissionGate({
      onPrompt: (req) => {
        prompted.push(req);
        gate.resolve(req.requestId, "allow");
      },
    });

    // 1. read_only: allowed
    const readRes = await gate.decide(makeRequest({
      toolName: "latex-root",
      permissionMode: "ask",
    }));
    expect(readRes.decision).toBe("allow");
    expect(prompted).toHaveLength(0);

    // 2. safe_write: prompts
    const writeRes = await gate.decide(makeRequest({
      requestId: "write-req",
      toolName: "research-brief-update",
      permissionMode: "ask",
      filePath: ".brief.md",
    }));
    expect(writeRes.decision).toBe("allow");
    expect(prompted).toHaveLength(1);

    // 3. shell_exec: prompts for commands the smart policy does not auto-allow
    const bashRes = await gate.decide(makeRequest({
      requestId: "bash-ask-req",
      toolName: "bash",
      permissionMode: "ask",
      bashCommand: "make build",
      bashCwd: ROOT,
    }));
    expect(bashRes.decision).toBe("allow");
    expect(prompted).toHaveLength(2);

    const mcpRes = await gate.decide(makeRequest({
      requestId: "mcp-ask-req",
      toolName: "mcp__papers__search",
      permissionMode: "ask",
    }));
    expect(mcpRes.decision).toBe("allow");
    expect(prompted).toHaveLength(3);
  });
});

describe("PermissionGate Shell Smart Convergence", () => {
  it("auto-allows safe bash commands in ask mode without suspending", async () => {
    const prompted: PermissionGateRequest[] = [];
    const gate = new PermissionGate({
      onPrompt: (req) => prompted.push(req),
    });

    const res = await gate.decide(makeRequest({
      toolName: "bash",
      permissionMode: "ask",
      bashCommand: "git status --short",
      bashCwd: ROOT,
    }));

    expect(res.decision).toBe("allow");
    expect(res.reason).toBe("smart_bash_allow");
    expect(prompted).toHaveLength(0);
  });

  it("denies bash commands on the smart deny list without suspending", async () => {
    const prompted: PermissionGateRequest[] = [];
    const gate = new PermissionGate({
      onPrompt: (req) => prompted.push(req),
    });

    const res = await gate.decide(makeRequest({
      toolName: "bash",
      permissionMode: "ask",
      bashCommand: "sudo rm -rf /tmp/x",
      bashCwd: ROOT,
    }));

    expect(res.decision).toBe("deny");
    expect(res.reason).toBe("smart_bash_deny");
    expect(prompted).toHaveLength(0);
  });

  it("suspends for prompt on bash commands the smart policy flags", async () => {
    const prompted: PermissionGateRequest[] = [];
    const gate = new PermissionGate({
      onPrompt: (req) => prompted.push(req),
    });

    const promise = gate.decide(makeRequest({
      requestId: "pending-shell",
      toolName: "bash",
      permissionMode: "ask",
      bashCommand: "make build",
      bashCwd: ROOT,
    }));
    await expect(gate.cancelRequest("pending-shell")).toBe(true);

    const res = await promise;
    expect(res.decision).toBe("deny");
    expect(res.reason).toBe("cancelled");
    expect(prompted.map((p) => p.requestId)).toContain("pending-shell");
  });

  it("keeps edit_auto behavior aligned with the renderer pre-judge", async () => {
    const prompted: PermissionGateRequest[] = [];
    const gate = new PermissionGate({
      onPrompt: (req) => prompted.push(req),
    });

    // Safe python run inside project: smart allow → no prompt under edit_auto.
    const pyRes = await gate.decide(makeRequest({
      toolName: "bash",
      permissionMode: "edit_auto",
      bashCommand: "python train.py",
      bashCwd: ROOT,
    }));
    expect(pyRes.decision).toBe("allow");
    expect(prompted).toHaveLength(0);

    // Generic command still suspends under edit_auto.
    const buildPromise = gate.decide(makeRequest({
      requestId: "editauto-shell",
      toolName: "bash",
      permissionMode: "edit_auto",
      bashCommand: "make build",
      bashCwd: ROOT,
    }));
    await expect(gate.cancelRequest("editauto-shell")).toBe(true);
    const buildRes = await buildPromise;
    expect(buildRes.decision).toBe("deny");
    expect(buildRes.reason).toBe("cancelled");
  });
});

describe("PermissionGate Always-Allow & Rules Matching", () => {
  it("allows tools in toolAllowAlways without prompt in ask mode", async () => {
    const prompted: PermissionGateRequest[] = [];
    const rules = buildPermissionRulesConfig({
      toolAllowAlways: ["delete"],
    });
    const gate = new PermissionGate({
      rules,
      onPrompt: (req) => prompted.push(req),
    });

    const res = await gate.decide(makeRequest({
      toolName: "delete",
      permissionMode: "ask",
      filePath: "temp.tex",
    }));

    expect(res.decision).toBe("allow");
    expect(prompted).toHaveLength(0);
  });

  it("allows bash commands matching bashAllowAlwaysPatterns without prompt in ask mode", async () => {
    const prompted: PermissionGateRequest[] = [];
    const rules = buildPermissionRulesConfig({
      bashAllowAlwaysPatterns: ["git status*", "npm test*"],
    });
    const gate = new PermissionGate({
      rules,
      onPrompt: (req) => prompted.push(req),
    });

    const res = await gate.decide(makeRequest({
      toolName: "bash",
      permissionMode: "ask",
      bashCommand: "git status --short",
      bashCwd: ROOT,
    }));

    expect(res.decision).toBe("allow");
    expect(prompted).toHaveLength(0);
  });
});

describe("PermissionGate Lifecycle & Timeout Recovery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("auto-denies after 120s timeout and recovers promise without leaking", async () => {
    const gate = new PermissionGate({ timeoutMs: 120_000 });

    const promise = gate.decide(makeRequest({
      requestId: "timeout-req",
      toolName: "bash",
      permissionMode: "ask",
      bashCommand: "long_task",
      bashCwd: ROOT,
    }));

    expect(gate.pendingCount()).toBe(1);

    vi.advanceTimersByTime(119_999);
    expect(gate.pendingCount()).toBe(1);

    vi.advanceTimersByTime(1);
    const result = await promise;
    expect(result.decision).toBe("deny");
    expect(result.reason).toBe("permission_timeout");
    expect(gate.pendingCount()).toBe(0);
  });

  it("cancels individual request when requested", async () => {
    const gate = new PermissionGate({ timeoutMs: 120_000 });
    const promise = gate.decide(makeRequest({
      requestId: "cancel-me",
      toolName: "bash",
      permissionMode: "ask",
      bashCommand: "make build",
      bashCwd: ROOT,
    }));

    expect(gate.pendingCount()).toBe(1);
    const cancelled = gate.cancelRequest("cancel-me");
    expect(cancelled).toBe(true);

    const result = await promise;
    expect(result.decision).toBe("deny");
    expect(result.reason).toBe("cancelled");
    expect(gate.pendingCount()).toBe(0);
  });

  it("cancels all pending requests for a given session when abort occurs", async () => {
    const gate = new PermissionGate({ timeoutMs: 120_000 });

    const p1 = gate.decide(makeRequest({
      requestId: "req-ses-1",
      runtimeSessionId: "ses-A",
      toolName: "bash",
      permissionMode: "ask",
      bashCommand: "cmd1",
      bashCwd: ROOT,
    }));

    const p2 = gate.decide(makeRequest({
      requestId: "req-ses-2",
      runtimeSessionId: "ses-A",
      toolName: "delete",
      permissionMode: "ask",
      filePath: "f2.tex",
    }));

    const p3 = gate.decide(makeRequest({
      requestId: "req-ses-3",
      runtimeSessionId: "ses-B",
      toolName: "delete",
      permissionMode: "ask",
      filePath: "f3.tex",
    }));

    expect(gate.pendingCount()).toBe(3);

    const count = gate.cancelSession("ses-A");
    expect(count).toBe(2);

    const res1 = await p1;
    const res2 = await p2;
    expect(res1.decision).toBe("deny");
    expect(res2.decision).toBe("deny");
    expect(gate.pendingCount()).toBe(1);

    // ses-B is still pending
    gate.resolve("req-ses-3", "allow");
    const res3 = await p3;
    expect(res3.decision).toBe("allow");
    expect(gate.pendingCount()).toBe(0);
  });
});

describe("PermissionGate Plan Mode Overrides", () => {
  const SESSION = "tab-plan-abc";

  it("allows write to the canonical session draft under plan mode", async () => {
    const gate = new PermissionGate();
    const res = await gate.decide(makeRequest({
      toolName: "write",
      permissionMode: "edit_auto",
      sessionAgent: "plan",
      sessionId: SESSION,
      filePath: `.prismnext/research/plans/drafts/${SESSION}.md`,
    }));
    expect(res.decision).toBe("allow");
    expect(res.reason).toBe("plan_override_allow");
  });

  it("denies write to a non-canonical draft path under plan mode", async () => {
    const gate = new PermissionGate();
    const res = await gate.decide(makeRequest({
      toolName: "write",
      permissionMode: "edit_auto",
      sessionAgent: "plan",
      sessionId: SESSION,
      filePath: ".prismnext/research/plans/drafts/other-file.md",
    }));
    expect(res.decision).toBe("deny");
    expect(res.reason).toBe("plan_override_deny");
  });

  it("denies execution tools under plan mode even in edit_auto", async () => {
    const gate = new PermissionGate();
    const res = await gate.decide(makeRequest({
      toolName: "experiment-run",
      permissionMode: "edit_auto",
      sessionAgent: "plan",
      sessionId: SESSION,
      bashCommand: "python train.py",
      bashCwd: ROOT,
    }));
    expect(res.decision).toBe("deny");
    expect(res.reason).toBe("plan_override_deny");
  });

  it("leaves bash allowed under plan mode (plan needs shell for research)", async () => {
    const gate = new PermissionGate();
    const res = await gate.decide(makeRequest({
      toolName: "bash",
      permissionMode: "auto",
      sessionAgent: "plan",
      sessionId: SESSION,
      bashCommand: "git status",
      bashCwd: ROOT,
    }));
    expect(res.decision).toBe("allow");
  });

  it("does not apply plan overrides in build mode", async () => {
    const gate = new PermissionGate();
    const res = await gate.decide(makeRequest({
      toolName: "experiment-run",
      permissionMode: "auto",
      sessionAgent: "build",
      sessionId: SESSION,
      bashCommand: "python train.py",
      bashCwd: ROOT,
    }));
    expect(res.decision).toBe("allow");
  });
});
