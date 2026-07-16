import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePermissionStore } from "../../src/renderer/stores/permission-store";
import { useChangesStore } from "../../src/renderer/stores/changes-store";
import { useChatStore } from "../../src/renderer/stores/chat-store";
import { useToolPermission } from "../../src/renderer/components/modules/chat/tools/use-tool-permission";

describe("useToolPermission", () => {
  beforeEach(() => {
    usePermissionStore.getState().clearAllPermissions();
    useChangesStore.setState({ changes: [] });
    useChatStore.setState({ activeTabId: "tab-1" } as any);
    vi.stubGlobal("electronAPI", undefined);
    (window as any).electronAPI = {
      chatAnswerPermission: vi.fn().mockResolvedValue(undefined),
    };
  });

  it("allows permission and clears store for edit tools", async () => {
    useChangesStore.getState().addChange({
      id: "call-1",
      filePath: "main.tex",
      absolutePath: "/proj/main.tex",
      oldContent: "a",
      newContent: "b",
      toolName: "edit",
    });
    usePermissionStore.getState().addPermission({
      id: "perm-1",
      tabId: "tab-1",
      toolCallId: "call-1",
      toolName: "edit",
      message: "Allow edit?",
      options: [],
    });

    const { result } = renderHook(() => useToolPermission("call-1", "edit"));

    expect(result.current.isAwaitingPermission).toBe(true);

    await act(async () => {
      await result.current.allow();
    });

    expect(window.electronAPI.chatAnswerPermission).toHaveBeenCalledWith("perm-1", true, "call-1", {
      always: false,
    });
    expect(usePermissionStore.getState().getPermissionForTool("tab-1", "call-1")).toBeUndefined();
    // Scheme A: edit uses permission gate only — proposed changes are not auto-cleared on allow
    expect(useChangesStore.getState().changes).toHaveLength(1);
  });

  it("denies permission and rejects proposed change for edit tools", async () => {
    useChangesStore.getState().addChange({
      id: "call-1",
      filePath: "main.tex",
      absolutePath: "/proj/main.tex",
      oldContent: "a",
      newContent: "b",
      toolName: "edit",
    });
    usePermissionStore.getState().addPermission({
      id: "perm-1",
      tabId: "tab-1",
      toolCallId: "call-1",
      toolName: "edit",
      message: "Allow edit?",
      options: [],
    });

    const { result } = renderHook(() => useToolPermission("call-1", "edit"));

    await act(async () => {
      await result.current.deny();
    });

    expect(window.electronAPI.chatAnswerPermission).toHaveBeenCalledWith("perm-1", false, "call-1");
    expect(usePermissionStore.getState().getPermissionForTool("tab-1", "call-1")).toBeUndefined();
    expect(usePermissionStore.getState().isToolDenied("tab-1", "call-1")).toBe(true);
    // Scheme A: deny does not revert disk via changes-store for edit tools
    expect(useChangesStore.getState().changes).toHaveLength(1);
  });

  it("allows bash permission without touching changes-store", async () => {
    usePermissionStore.getState().addPermission({
      id: "perm-2",
      tabId: "tab-1",
      toolCallId: "call-2",
      toolName: "bash",
      message: "Allow shell?",
      options: [],
    });

    const { result } = renderHook(() => useToolPermission("call-2", "bash"));

    await act(async () => {
      await result.current.allow();
    });

    expect(window.electronAPI.chatAnswerPermission).toHaveBeenCalledWith("perm-2", true, "call-2", {
      always: false,
    });
    expect(useChangesStore.getState().changes).toHaveLength(0);
  });
});
