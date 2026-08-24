import { describe, expect, it } from "vitest";
import { suggestPlanTool } from "../../src/main/agent/tools/interactive";
import type { ToolExecuteContext } from "../../src/main/agent/tool-host";

const BASE_CTX = {
  runtimeSessionId: "rt-1",
  tabId: "tab-plan-1",
  turnId: "turn-1",
  toolCallId: "call-1",
  projectRoot: "/Users/me/paper",
  permissionMode: "auto" as const,
};

describe("suggestPlanTool", () => {
  it("returns draftPath + write instruction when the user accepts plan mode", async () => {
    const ctx: ToolExecuteContext = {
      ...BASE_CTX,
      suggestPlan: async ({ reason }) => ({
        accepted: true,
        reason: "user_accept",
        runtimeSessionId: "rt-1",
      }),
    };
    const result = await suggestPlanTool.execute({ reason: "Multi-step study" }, ctx);

    expect(result).toMatchObject({
      suggested: true,
      accepted: true,
      planMode: true,
    });
    const r = result as { draftPath?: string; instruction?: string };
    expect(r.draftPath).toContain(".workbench/research/plans/drafts/");
    expect(r.instruction).toContain("BINDING");
    expect(r.instruction).toContain("## Analysis / ## Plan / ## Checklist");
  });

  it("returns plain rejection when plan mode is dismissed", async () => {
    const ctx: ToolExecuteContext = {
      ...BASE_CTX,
      suggestPlan: async ({ reason }) => ({
        accepted: false,
        reason: "user_dismiss",
      }),
    };
    const result = await suggestPlanTool.execute({ reason: "Multi-step study" }, ctx);
    expect(result).toMatchObject({
      suggested: true,
      accepted: false,
    });
    expect((result as { draftPath?: string }).draftPath).toBeUndefined();
  });
});
