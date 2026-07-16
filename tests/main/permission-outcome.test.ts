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

  it("falls back when options array is empty", () => {
    expect(buildPermissionOutcome([], true)).toEqual({
      outcome: { outcome: "selected", optionId: "allow_once" },
    });
    expect(buildPermissionOutcome([], false)).toEqual({
      outcome: { outcome: "selected", optionId: "reject_once" },
    });
  });

  it("prefers allow_always when Always was chosen (Phase 2 allow_always)", () => {
    const outcome = buildPermissionOutcome(
      [
        { optionId: "once", kind: "allow_once", name: "Allow" },
        { optionId: "always", kind: "allow_always", name: "Always" },
      ],
      true,
      { preferAlways: true },
    );
    expect(outcome).toEqual({
      outcome: { outcome: "selected", optionId: "always" },
    });
  });
});
