import { describe, it, expect, beforeEach, vi } from "vitest";

const {
  executeApprovedBashJob,
  denyBashJob,
  approveCustomToolJob,
} = vi.hoisted(() => ({
  executeApprovedBashJob: vi.fn(),
  denyBashJob: vi.fn(),
  approveCustomToolJob: vi.fn(),
}));

vi.mock("electron", () => ({
  app: {
    getPath: () => "/tmp/prism-bash-bridge-auto-allow-test",
    isPackaged: true,
  },
}));

vi.mock("electron-store", () => ({
  default: class {
    constructor() {}
    get() {
      return undefined;
    }
    set() {}
    store = {};
  },
}));

vi.mock("../../src/main/services/settings", () => ({
  getSettings: () => ({ permissionMode: "auto", agentTerminalMode: "pty" }),
  addBashAllowAlwaysFromCommand: vi.fn(),
  addToolAllowAlways: vi.fn(),
  isBashCommandAllowAlways: () => false,
  isToolAllowAlways: () => false,
}));

vi.mock("../../src/main/services/bash-permission-bridge", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/main/services/bash-permission-bridge")>();
  return {
    ...actual,
    executeApprovedBashJob,
    denyBashJob,
    approveCustomToolJob,
  };
});

import { AcpService } from "../../src/main/acp/service";

const ROOT = "/Users/me/paper";

function withProjectPath(svc: AcpService, projectPath: string): AcpService {
  (svc as unknown as { projectPath: string }).projectPath = projectPath;
  return svc;
}

describe("syncBashPermissionFromToolCall — smart policy bridge", () => {
  beforeEach(() => {
    executeApprovedBashJob.mockClear();
    denyBashJob.mockClear();
    approveCustomToolJob.mockClear();
    (AcpService as unknown as { instance: null }).instance = null;
  });

  it("auto-executes in-project git when OpenCode skips ACP requestPermission", () => {
    const svc = withProjectPath(AcpService.getInstance(), ROOT);
    svc.syncBashPermissionFromToolCall({
      sessionId: "ses_auto_bash",
      tabId: "tab-1",
      toolCallId: "call_function_auto_1",
      command: "git commit -m test",
      cwd: ROOT,
    });

    expect(executeApprovedBashJob).toHaveBeenCalledTimes(1);
    expect(executeApprovedBashJob).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "ses_auto_bash",
        chatTabId: "tab-1",
        toolCallId: "call_function_auto_1",
        command: "git commit -m test",
      }),
    );
  });

  it("denies delete outside the project without auto-approve", () => {
    const svc = withProjectPath(AcpService.getInstance(), ROOT);
    svc.syncCustomToolPermissionFromToolCall({
      sessionId: "ses_auto_del",
      tabId: "tab-1",
      toolCallId: "call_delete_1",
      toolName: "delete",
      input: { file_path: "/tmp/x.md" },
    });

    expect(denyBashJob).toHaveBeenCalledWith("ses_auto_del", "call_delete_1");
    expect(approveCustomToolJob).not.toHaveBeenCalled();
  });

  it("does not auto-approve in-project delete (composer gate handles prompt)", () => {
    const svc = withProjectPath(AcpService.getInstance(), ROOT);
    svc.syncCustomToolPermissionFromToolCall({
      sessionId: "ses_del_in",
      tabId: "tab-1",
      toolCallId: "call_delete_2",
      toolName: "delete",
      input: { file_path: "old.tex" },
    });

    expect(approveCustomToolJob).not.toHaveBeenCalled();
    expect(denyBashJob).not.toHaveBeenCalled();
  });
});
