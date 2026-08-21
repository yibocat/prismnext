import { describe, it, expect, beforeEach } from "vitest";
import {
  hasPendingPermission,
  listBackgroundPending,
  pickActivePermission,
  usePermissionStore,
} from "../../src/renderer/stores/permission-store";

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

  it("pickActivePermission only returns the active tab's card", () => {
    const perms = [
      {
        id: "a",
        tabId: "tab-a",
        toolCallId: "call-a",
        toolName: "write",
        message: "A",
        options: [],
      },
      {
        id: "b",
        tabId: "tab-b",
        toolCallId: "call-b",
        toolName: "write",
        message: "B",
        options: [],
      },
    ];
    expect(pickActivePermission("tab-a", perms)?.id).toBe("a");
    expect(pickActivePermission("tab-b", perms)?.id).toBe("b");
    expect(listBackgroundPending(perms, "tab-a").map((p) => p.tabId)).toEqual(["tab-b"]);
    expect(hasPendingPermission(perms, "tab-b")).toBe(true);
    expect(hasPendingPermission(perms, "tab-a")).toBe(true);
    expect(hasPendingPermission(perms, "tab-c")).toBe(false);
  });
});
