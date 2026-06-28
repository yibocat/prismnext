import { describe, it, expect } from "vitest";
import {
  resolvePermissionAction,
  shouldPromptForPermission,
} from "../../src/main/services/permission-modes";
import { shouldShowPermissionGate } from "../../src/renderer/components/modules/chat/permission-gate-panel";
import { shouldTrackProposedChange } from "../../src/renderer/components/modules/chat/tools/tool-meta";

describe("permission gate", () => {
  it("ask mode shows gate for edit and bash", () => {
    expect(shouldShowPermissionGate("ask", "edit")).toBe(true);
    expect(shouldShowPermissionGate("ask", "bash")).toBe(true);
    expect(shouldShowPermissionGate("ask", "read")).toBe(false);
  });

  it("auto mode shows gate only for tools that prompt", () => {
    expect(shouldShowPermissionGate("auto", "edit")).toBe(false);
    expect(shouldShowPermissionGate("auto", "bash")).toBe(true);
    expect(shouldPromptForPermission("auto", "bash")).toBe(true);
    expect(shouldPromptForPermission("auto", "write")).toBe(false);
  });

  it("scheme A disables proposed-change review in ask", () => {
    expect(shouldTrackProposedChange("ask", "edit")).toBe(false);
  });

  it("readonly denies edit and bash at main process", () => {
    expect(resolvePermissionAction("readonly", "edit")).toBe("deny");
    expect(resolvePermissionAction("readonly", "bash")).toBe("deny");
  });

  it("delete and move use inline gate on tool row, not composer", () => {
    expect(shouldShowPermissionGate("ask", "delete")).toBe(false);
    expect(shouldShowPermissionGate("auto", "delete")).toBe(false);
    expect(shouldShowPermissionGate("auto", "move")).toBe(false);
    expect(shouldPromptForPermission("auto", "delete")).toBe(true);
    expect(shouldPromptForPermission("ask", "delete")).toBe(true);
    expect(resolvePermissionAction("readonly", "delete")).toBe("deny");
  });
});
