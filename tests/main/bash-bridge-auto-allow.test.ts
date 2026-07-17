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

describe("syncBashPermissionFromToolCall — Auto mode bridge unblock", () => {
  beforeEach(() => {
    executeApprovedBashJob.mockClear();
    denyBashJob.mockClear();
    approveCustomToolJob.mockClear();
    (AcpService as unknown as { instance: null }).instance = null;
  });

  it("auto-executes custom bash when OpenCode skips ACP requestPermission", () => {
    const svc = AcpService.getInstance();
    svc.syncBashPermissionFromToolCall({
      sessionId: "ses_auto_bash",
      tabId: "tab-1",
      toolCallId: "call_function_auto_1",
      command:
        'cd "/tmp/tool-output" && rg -o \'"paper_id"\' tool_f6f60871e001ArHISGb2G0neDo',
      cwd: "/tmp",
    });

    expect(executeApprovedBashJob).toHaveBeenCalledTimes(1);
    expect(executeApprovedBashJob).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "ses_auto_bash",
        chatTabId: "tab-1",
        toolCallId: "call_function_auto_1",
        command: expect.stringContaining("tool_f6f60871e001ArHISGb2G0neDo"),
      }),
    );
  });

  it("auto-approves custom delete without emitting a prompt gate", () => {
    const svc = AcpService.getInstance();
    svc.syncCustomToolPermissionFromToolCall({
      sessionId: "ses_auto_del",
      tabId: "tab-1",
      toolCallId: "call_delete_1",
      toolName: "delete",
      input: { file_path: "/tmp/x.md" },
    });

    expect(approveCustomToolJob).toHaveBeenCalledWith("ses_auto_del", "call_delete_1");
    expect(denyBashJob).not.toHaveBeenCalled();
  });
});
