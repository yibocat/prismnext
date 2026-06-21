import { describe, it, expect } from "vitest";
import { buildPermissionOutcome } from "../../src/main/acp/permission";

describe("permission outcome", () => {
  it("selects an allow option when approved", () => {
    const outcome = buildPermissionOutcome([
      { optionId: "reject", kind: "reject_once", name: "Reject" },
      { optionId: "allow", kind: "allow_once", name: "Allow" },
    ], true);

    expect(outcome).toEqual({ outcome: { outcome: "selected", optionId: "allow" } });
  });

  it("selects a reject option when rejected", () => {
    const outcome = buildPermissionOutcome([
      { optionId: "allow", kind: "allow_once", name: "Allow" },
      { optionId: "reject", kind: "reject_once", name: "Reject" },
    ], false);

    expect(outcome).toEqual({ outcome: { outcome: "selected", optionId: "reject" } });
  });

  it("cancels when no matching option exists", () => {
    expect(buildPermissionOutcome([], true)).toEqual({ outcome: { outcome: "cancelled" } });
  });
});
