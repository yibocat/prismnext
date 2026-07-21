import { describe, expect, it } from "vitest";
import {
  isResearchBriefPath,
  isResearchPlansDirPath,
  resolveEffectivePermissionRule,
  resolveSessionAgent,
} from "../../src/shared/session-agent";
import { RESEARCH_BRIEF_REL } from "../../src/shared/research-brief";
import {
  DRAFT_PLAN_REL,
  isResearchPlanDraftPath,
  RESEARCH_PLAN_DRAFTS_DIR_REL,
  sessionDraftPlanRel,
} from "../../src/shared/research-plan";
import { ensurePlanAgentPermissionConfig } from "../../src/main/services/opencode-tools-config";

describe("session-agent (OpenCode-aligned Plan)", () => {
  it("defaults unknown to build", () => {
    expect(resolveSessionAgent(undefined)).toBe("build");
    expect(resolveSessionAgent("plan")).toBe("plan");
  });

  it("Plan denies edit of non-plan paths even when permissionMode is auto", () => {
    expect(
      resolveEffectivePermissionRule("auto", "plan", "edit", {
        filePath: "manuscript/main.tex",
        projectRoot: "/proj",
      }),
    ).toBe("deny");
    expect(resolveEffectivePermissionRule("auto", "plan", "latex-compile")).toBe("deny");
    expect(resolveEffectivePermissionRule("auto", "plan", "experiment-run")).toBe("deny");
  });

  it("Plan hard-binds draft writes to this session’s canonical path when sessionId is set", () => {
    expect(
      resolveEffectivePermissionRule("auto", "plan", "edit", {
        filePath: sessionDraftPlanRel("ses_1"),
        projectRoot: "/proj",
        sessionId: "ses_1",
      }),
    ).toBe("allow");
    expect(
      resolveEffectivePermissionRule("auto", "plan", "edit", {
        filePath: DRAFT_PLAN_REL,
        projectRoot: "/proj",
        sessionId: "ses_1",
      }),
    ).toBe("allow");
    // Invented drafts/<title>.md must be denied — soft prompt alone failed in the wild.
    expect(
      resolveEffectivePermissionRule("auto", "plan", "write", {
        filePath: `${RESEARCH_PLAN_DRAFTS_DIR_REL}/exp-improvement-plan-20260718.md`,
        projectRoot: "/proj",
        sessionId: "ses_1",
      }),
    ).toBe("deny");
    expect(
      resolveEffectivePermissionRule("auto", "plan", "write", {
        filePath: sessionDraftPlanRel("ses_other"),
        projectRoot: "/proj",
        sessionId: "ses_1",
      }),
    ).toBe("deny");
    expect(
      resolveEffectivePermissionRule("auto", "plan", "write", {
        filePath: `.prismnext/research/plans/2026-07-18-abcd.md`,
        projectRoot: "/proj",
        sessionId: "ses_1",
      }),
    ).toBe("deny");
  });

  it("Plan without sessionId still allows broad plans-dir writes (fallback)", () => {
    expect(
      resolveEffectivePermissionRule("auto", "plan", "write", {
        filePath: `.prismnext/research/plans/2026-07-18-abcd.md`,
        projectRoot: "/proj",
      }),
    ).toBe("allow");
  });

  it("Plan does NOT hard-deny bash — follows Permission Mode (OpenCode plan default)", () => {
    expect(resolveEffectivePermissionRule("auto", "plan", "bash")).toBe("allow");
    expect(
      resolveEffectivePermissionRule("auto", "plan", "bash", {
        bashCommand: "ls -la .prismnext/research/plans",
      }),
    ).toBe("allow");
    expect(resolveEffectivePermissionRule("ask", "plan", "bash")).toBe("ask");
  });

  it("unknown edit path under Plan asks (not silent deny)", () => {
    expect(resolveEffectivePermissionRule("auto", "plan", "edit")).toBe("ask");
  });

  it("isResearchPlanDraftPath / isResearchPlansDirPath", () => {
    expect(isResearchPlanDraftPath(DRAFT_PLAN_REL)).toBe(true);
    expect(isResearchPlanDraftPath(sessionDraftPlanRel("ses_1"))).toBe(true);
    expect(isResearchPlansDirPath(".prismnext/research/plans/x.md")).toBe(true);
    expect(isResearchPlansDirPath("src/main.tex")).toBe(false);
  });

  it("Plan asks for research-brief-update and literature-add", () => {
    expect(resolveEffectivePermissionRule("auto", "plan", "research-brief-update")).toBe("ask");
    expect(resolveEffectivePermissionRule("auto", "plan", "literature-add")).toBe("ask");
  });

  it("Build uses permissionMode only", () => {
    expect(resolveEffectivePermissionRule("ask", "build", "edit")).toBe("ask");
    expect(resolveEffectivePermissionRule("auto", "build", "edit")).toBe("allow");
    expect(resolveEffectivePermissionRule("auto", "build", "bash")).toBe("allow");
  });

  it("denies generic edit/write on research brief.md for Build and Plan", () => {
    expect(isResearchBriefPath(RESEARCH_BRIEF_REL)).toBe(true);
    expect(isResearchBriefPath(`/proj/${RESEARCH_BRIEF_REL}`, "/proj")).toBe(true);
    expect(
      resolveEffectivePermissionRule("auto", "build", "edit", {
        filePath: RESEARCH_BRIEF_REL,
        projectRoot: "/proj",
      }),
    ).toBe("deny");
    expect(
      resolveEffectivePermissionRule("auto", "build", "write", {
        filePath: `/proj/${RESEARCH_BRIEF_REL}`,
        projectRoot: "/proj",
      }),
    ).toBe("deny");
    expect(
      resolveEffectivePermissionRule("auto", "plan", "edit", {
        filePath: RESEARCH_BRIEF_REL,
        projectRoot: "/proj",
        sessionId: "ses_1",
      }),
    ).toBe("deny");
    // Non-brief paths unchanged for Build auto.
    expect(
      resolveEffectivePermissionRule("auto", "build", "edit", {
        filePath: "manuscript/main.tex",
        projectRoot: "/proj",
      }),
    ).toBe("allow");
  });
});

describe("ensurePlanAgentPermissionConfig", () => {
  it("merges Prism plans dir into OpenCode plan agent edit allowlist", () => {
    const next = ensurePlanAgentPermissionConfig({});
    const plan = (next.agent as { plan: { permission: { edit: Record<string, string> } } }).plan;
    expect(plan.permission.edit["*"]).toBe("deny");
    expect(plan.permission.edit[DRAFT_PLAN_REL]).toBe("allow");
    expect(plan.permission.edit[`${RESEARCH_PLAN_DRAFTS_DIR_REL}/**`]).toBe("allow");
    expect(plan.permission.edit[".prismnext/research/plans/**"]).toBe("allow");
  });
});
