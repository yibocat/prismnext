/**
 * Research-scenario contract tests for Prompt Hard/Soft architecture (P0–P3).
 * Manual checklist: docs-private/superpowers/verification/2026-07-21-prompt-hard-soft-scenarios.md
 */
import { describe, expect, it } from "vitest";
import { ALL_MODULES } from "../../src/main/prompts/modules";
import { CHAT_CITATION_STAGING_PROMPT } from "../../src/main/prompts/modules/chat-citation-staging";
import { EXPERIMENTS_PROMPT } from "../../src/main/prompts/modules/experiments";
import { LITERATURE_LIBRARY_PROMPT } from "../../src/main/prompts/modules/literature-library";
import { ORCHESTRATOR_JUDGMENT_PROMPT, buildOrchestratorJudgmentPrompt } from "../../src/main/prompts/modules/orchestrator-judgment";
import { composeOrchestratorProfileModulePrompts, resolveOrchestratorProfileModuleKeys, resolveStableSystemModules } from "../../src/main/prompts/resolve-active-modules";
import { buildPlanModeTurnAppendix } from "../../src/main/prompts/per-turn/plan-mode";
import { BUILTIN_TOOLS } from "../../src/main/tools";
import { buildOpencodeToolDescription } from "../../src/main/tools/tool-description";
import { RESEARCH_BRIEF_REL } from "../../src/shared/research-brief";
import {
  PLAN_DOC_STRUCTURE_HINTS,
  buildApprovedPlanExecutePrompt,
  planDraftMissingRedirectNote,
  sessionDraftPlanRel,
} from "../../src/shared/research-plan";
import { buildPlanSuggestAcceptedResult } from "../../src/shared/plan-suggest";
import { resolveEffectivePermissionRule } from "../../src/shared/session-agent";
import { TOOL_NAMES } from "../../src/shared/tool-names";

function toolDesc(name: string): string {
  const meta = BUILTIN_TOOLS.find((t) => t.name === name);
  expect(meta, `missing tool meta: ${name}`).toBeTruthy();
  return buildOpencodeToolDescription(meta!);
}

describe("S1 — experiment design Plan suggest is AI-soft (tool), not keyword HARD", () => {
  it("no global plan-consent module; suggest-plan tool carries research multi-phase when/how", () => {
    expect(ALL_MODULES.some((m) => m.key === "plan-consent")).toBe(false);
    expect(resolveStableSystemModules().map((m) => m.key)).not.toContain("plan-consent");
    const desc = toolDesc(TOOL_NAMES.suggestPlan);
    expect(desc).toContain("suggest");
    expect(desc.toLowerCase()).toMatch(/plan/);
    expect(desc).toMatch(/multi-step|multi-phase/i);
    expect(desc.toLowerCase()).toContain("research");
    expect(desc).toMatch(/experiment design|hypothes/i);
    expect(desc).toMatch(/design phase|execution-only|execution only/i);
    expect(desc).toContain("accepted");
    expect(desc).toContain("draftPath");
  });

  it("orchestrator judgment is orchestration-only — no tool names; domains from profile at compose time", () => {
    expect(ORCHESTRATOR_JUDGMENT_PROMPT).not.toMatch(/literature-search|literature-discover|latex-compile/);
    expect(ORCHESTRATOR_JUDGMENT_PROMPT).not.toMatch(/\[@bibkey\]|\[n\]/);
    expect(ORCHESTRATOR_JUDGMENT_PROMPT).not.toContain("15s consent strip");
    expect(ORCHESTRATOR_JUDGMENT_PROMPT).not.toContain("Entering Plan mode (consent");
    expect(ORCHESTRATOR_JUDGMENT_PROMPT).toContain("Through-line");
    expect(ORCHESTRATOR_JUDGMENT_PROMPT).toContain(".brief.md");

    const composed = composeOrchestratorProfileModulePrompts();
    const judgmentOnly = buildOrchestratorJudgmentPrompt({
      profileModules: resolveOrchestratorProfileModuleKeys(),
      profileModuleSummaries: ALL_MODULES.filter(
        (m) => m.profileOnly && m.key !== "orchestrator-judgment",
      ).map((m) => ({ key: m.key, label: m.label, description: m.description })),
    });
    expect(judgmentOnly).toContain("Chat Paper Citations");
    expect(judgmentOnly).toContain("Task delegation");
    expect(judgmentOnly).not.toMatch(/literature-search|literature-discover|latex-compile/);
    expect(composed).toContain("Chat Paper Citations");
  });
});

describe("S2 — Enter Plan → draft file is plan of record", () => {
  it("accept result binds draftPath + structure hints for same-turn write", () => {
    const r = buildPlanSuggestAcceptedResult("ses_bubble");
    expect(r.draftPath).toBe(sessionDraftPlanRel("ses_bubble"));
    expect(r.instruction).toContain(r.draftPath);
    expect(r.instruction).toContain(PLAN_DOC_STRUCTURE_HINTS);
    expect(r.instruction).toContain("same turn");
  });

  it("per-turn Plan appendix is path-only (no full structure dump)", () => {
    const appendix = buildPlanModeTurnAppendix("ses_bubble");
    expect(appendix).toContain(sessionDraftPlanRel("ses_bubble"));
    expect(appendix).not.toContain(PLAN_DOC_STRUCTURE_HINTS);
  });

  it("missing-draft kick carries structure hints", () => {
    expect(planDraftMissingRedirectNote("ses_bubble")).toContain(PLAN_DOC_STRUCTURE_HINTS);
  });

  it("Plan HARD-denies invented drafts filename", () => {
    expect(
      resolveEffectivePermissionRule("auto", "plan", "write", {
        filePath: ".prismnext/research/plans/drafts/bubble-vs-quick-plan.md",
        projectRoot: "/proj",
        sessionId: "ses_bubble",
      }),
    ).toBe("deny");
    expect(
      resolveEffectivePermissionRule("auto", "plan", "write", {
        filePath: sessionDraftPlanRel("ses_bubble"),
        projectRoot: "/proj",
        sessionId: "ses_bubble",
      }),
    ).toBe("allow");
  });
});

describe("S3 — Approve seeds todowrite (prompt contract)", () => {
  it("approved execute prompt requires FIRST todowrite when todos provided", () => {
    const prompt = buildApprovedPlanExecutePrompt({
      relativePath: ".prismnext/research/plans/2026-07-21-ab12.md",
      title: "Bubble vs Quick",
      todos: [
        { content: "Phase 1 — Design", status: "pending" },
        { content: "Phase 2 — Run", status: "pending" },
      ],
    });
    expect(prompt).toContain("FIRST** tool call this turn must be `todowrite`");
    expect(prompt).toContain("Phase 1 — Design");
  });
});

describe("S4 — external literature recommendations", () => {
  it("module defers staging rules to literature-stage; tool keeps BINDING", () => {
    expect(CHAT_CITATION_STAGING_PROMPT).toContain(TOOL_NAMES.literatureStage);
    expect(CHAT_CITATION_STAGING_PROMPT).toContain("see that tool");
    expect(CHAT_CITATION_STAGING_PROMPT).not.toContain("BINDING");
    expect(CHAT_CITATION_STAGING_PROMPT).not.toContain("search_arxiv");
    expect(CHAT_CITATION_STAGING_PROMPT).not.toContain("tool-output");

    const desc = toolDesc(TOOL_NAMES.literatureStage);
    expect(desc).toContain("BINDING");
    expect(desc).toMatch(/literature-discover/i);
    expect(desc).toContain("[n]");
  });
});

describe("S5 — intensive PDF reading", () => {
  it("library module + intensive tool point to add-then-read-pdf", () => {
    expect(LITERATURE_LIBRARY_PROMPT).toContain(TOOL_NAMES.literatureIntensiveReading);
    expect(LITERATURE_LIBRARY_PROMPT).toContain(TOOL_NAMES.literatureReadPdf);
    const intensive = toolDesc(TOOL_NAMES.literatureIntensiveReading);
    expect(intensive).toContain("intensive");
    const readPdf = toolDesc(TOOL_NAMES.literatureReadPdf);
    expect(readPdf).toContain(TOOL_NAMES.literatureIntensiveReading);
  });
});

describe("S6 — brief.md generic edit denied (HARD)", () => {
  it("Build and Plan deny edit/write on research brief", () => {
    for (const agent of ["build", "plan"] as const) {
      expect(
        resolveEffectivePermissionRule("auto", agent, "edit", {
          filePath: RESEARCH_BRIEF_REL,
          projectRoot: "/proj",
          sessionId: "ses_x",
        }),
      ).toBe("deny");
      expect(
        resolveEffectivePermissionRule("auto", agent, "write", {
          filePath: `/proj/${RESEARCH_BRIEF_REL}`,
          projectRoot: "/proj",
          sessionId: "ses_x",
        }),
      ).toBe("deny");
    }
  });
});

describe("S7 — compile asks are soft (no keyword Plan gate in app)", () => {
  it("app has no user-message Plan heuristic export", async () => {
    const mod = await import("../../src/shared/plan-suggest");
    expect("shouldSuggestPlanFromUserMessage" in mod).toBe(false);
  });
});

describe("S8 — Plan wrong drafts path is HARD-deny (covered in S2)", () => {
  it("canonical session draft is allow; invented name is deny", () => {
    expect(
      resolveEffectivePermissionRule("auto", "plan", "write", {
        filePath: ".prismnext/research/plans/drafts/foo-plan.md",
        projectRoot: "/proj",
        sessionId: "ses_x",
      }),
    ).toBe("deny");
  });
});

describe("S9 — experiments module does not restate HARD venv essay", () => {
  it("points at experiment-run tool instead of uv pip manuals", () => {
    expect(EXPERIMENTS_PROMPT).toContain(TOOL_NAMES.experimentRun);
    expect(EXPERIMENTS_PROMPT).not.toContain("uv pip --system");
    expect(EXPERIMENTS_PROMPT).not.toContain("### Workflow (binding)");
    expect(EXPERIMENTS_PROMPT).not.toContain("platform-enforced");
  });
});
