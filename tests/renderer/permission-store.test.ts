import { describe, it, expect, beforeEach } from "vitest";
import { usePermissionStore } from "../../src/renderer/stores/permission-store";

describe("permission-store", () => {
  beforeEach(() => {
    usePermissionStore.getState().clearAllPermissions();
  });

  it("finds a pending permission by tool call id", () => {
    usePermissionStore.getState().addPermission({
      id: "perm-1",
      tabId: "tab-1",
      toolCallId: "call-1",
      toolName: "edit",
      message: "Allow edit?",
      options: [],
    });

    expect(usePermissionStore.getState().getPermissionForTool("tab-1", "call-1")).toMatchObject({
      id: "perm-1",
      toolName: "edit",
    });
  });

  it("clears a resolved permission", () => {
    const store = usePermissionStore.getState();
    store.addPermission({
      id: "perm-1",
      tabId: "tab-1",
      toolCallId: "call-1",
      message: "Allow edit?",
      options: [{ optionId: "allow", kind: "allow_once", name: "Allow" }],
    });

    store.clearPermission("perm-1");

    expect(usePermissionStore.getState().getPermissionForTool("tab-1", "call-1")).toBeUndefined();
  });
});
