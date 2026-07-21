import { describe, expect, it } from "vitest";
import { isEditableFileTabKind } from "../../src/renderer/lib/workspace/mode-registry";
import { isResearchPlanFilePath } from "../../src/renderer/lib/chat/plan-artifact-ui";
import { sessionDraftPlanRel } from "../../src/shared/research-plan";

describe("research-plan tab routing", () => {
  it("treats research-plan as an editable file tab kind", () => {
    expect(isEditableFileTabKind("research-plan")).toBe(true);
    expect(isEditableFileTabKind("file")).toBe(true);
    expect(isEditableFileTabKind("browser")).toBe(false);
  });

  it("recognizes per-session drafts and approved plans as plan file paths", () => {
    expect(isResearchPlanFilePath(sessionDraftPlanRel("ses_1"))).toBe(true);
    expect(isResearchPlanFilePath(".prismnext/research/plans/2026-07-18-abcd.md")).toBe(true);
    expect(isResearchPlanFilePath("manuscript/main.tex")).toBe(false);
  });
});
