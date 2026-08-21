import { describe, expect, it } from "vitest";
import {
  DRAFT_PLAN_FILENAME,
  DRAFT_PLAN_REL,
  PLAN_DOC_REQUIRED_SECTIONS,
  PLAN_DOC_STRUCTURE_HINTS,
  buildApprovedPlanExecuteDisplayText,
  buildApprovedPlanExecutePrompt,
  draftPlanPathBelongsToSession,
  extractPlanFrontmatterDescription,
  parsePlanChecklist,
  parseResearchPlan,
  researchPlanFileName,
  serializeResearchPlan,
  sessionDraftPlanRel,
  type ResearchPlanDoc,
} from "../../src/shared/research-plan";
import { buildPlanModeTurnAppendix } from "../../src/main/prompts/per-turn/plan-mode";
import { planDraftMissingRedirectNote } from "../../src/shared/research-plan";

const sampleDoc: ResearchPlanDoc = {
  meta: {
    id: "a3f2",
    status: "approved",
    sessionId: "sess-1",
    createdAt: "2026-07-18T08:00:00.000Z",
    updatedAt: "2026-07-18T08:30:00.000Z",
    title: "Experiment design",
  },
  goal: "Validate the hypothesis under controlled conditions.",
  steps: [
    { text: "Literature review", status: "completed" },
    { text: "Design experiment", status: "in_progress" },
    { text: "Run pilot" },
  ],
  conclusions: "Pilot results support the main claim.",
  nextActions: "Scale to full dataset next week.",
};

describe("research-plan", () => {
  it("researchPlanFileName uses createdAt date and id", () => {
    expect(
      researchPlanFileName({ id: "a3f2", createdAt: "2026-07-18T08:00:00.000Z" }),
    ).toBe("2026-07-18-a3f2.md");
  });

  it("serializeResearchPlan and parseResearchPlan round-trip", () => {
    const markdown = serializeResearchPlan(sampleDoc);
    expect(markdown).toContain("id: a3f2");
    expect(markdown).toContain("status: approved");
    expect(markdown).toContain("## Goal");
    expect(markdown).toContain("## Steps");
    expect(markdown).toContain("1. Literature review *(completed)*");

    const parsed = parseResearchPlan(markdown);
    expect(parsed).not.toBeNull();
    expect(parsed!.meta.id).toBe("a3f2");
    expect(parsed!.meta.status).toBe("approved");
    expect(parsed!.meta.sessionId).toBe("sess-1");
    expect(parsed!.meta.title).toBe("Experiment design");
    expect(parsed!.goal).toBe("Validate the hypothesis under controlled conditions.");
    expect(parsed!.steps).toEqual([
      { text: "Literature review", status: "completed" },
      { text: "Design experiment", status: "in_progress" },
      { text: "Run pilot" },
    ]);
    expect(parsed!.conclusions).toBe("Pilot results support the main claim.");
    expect(parsed!.nextActions).toBe("Scale to full dataset next week.");
  });

  it("parseResearchPlan returns null for invalid markdown", () => {
    expect(parseResearchPlan("")).toBeNull();
    expect(parseResearchPlan("# no frontmatter")).toBeNull();
    expect(
      parseResearchPlan(`---
id: x
status: not-a-status
createdAt: 2026-07-18T00:00:00.000Z
updatedAt: 2026-07-18T00:00:00.000Z
---
`),
    ).toBeNull();
  });

  it("DRAFT_PLAN_FILENAME is current-draft.md", () => {
    expect(DRAFT_PLAN_FILENAME).toBe("current-draft.md");
  });

  it("serializeResearchPlan keeps freeform body intact (no Steps shredding)", () => {
    const body = `# 实验改进与优化规划

## 现状快照

已有 baseline。

## Plan

1. 跑全量 benchmark
`;
    const markdown = serializeResearchPlan({
      ...sampleDoc,
      body,
      goal: "should not appear when body is set",
      steps: [{ text: "should not appear when body is set" }],
      conclusions: "should not appear when body is set",
    });
    expect(markdown).toContain("## 现状快照");
    expect(markdown).toContain("1. 跑全量 benchmark");
    expect(markdown).not.toContain("## Steps");
    expect(markdown).not.toContain("## Conclusions");
    expect(markdown).not.toContain("should not appear when body is set");

    const parsed = parseResearchPlan(markdown);
    expect(parsed?.body).toContain("实验改进与优化规划");
    expect(parsed?.steps).toEqual([]);
  });
});

describe("plan doc standard", () => {
  const structuredPlan = `---
id: b1c2
status: approved
createdAt: 2026-07-18T10:00:00.000Z
updatedAt: 2026-07-18T10:00:00.000Z
title: Sorting study
---
# Sorting study

## Analysis

N=100 is thin; need more repeats.

## Plan

### Phase 1 — Stats
1. Bump REPEATS to 30
2. Report effect sizes

### Phase 2 — Coverage
1. Add near-sorted inputs

## Checklist

- [x] Phase 1 — Stats
- [ ] Phase 2 — Coverage
`;

  it("PLAN_DOC_REQUIRED_SECTIONS are Analysis, Plan, Checklist", () => {
    expect([...PLAN_DOC_REQUIRED_SECTIONS]).toEqual(["Analysis", "Plan", "Checklist"]);
  });

  it("parsePlanChecklist prefers ## Checklist section", () => {
    expect(parsePlanChecklist(structuredPlan)).toEqual([
      { text: "Phase 1 — Stats", checked: true },
      { text: "Phase 2 — Coverage", checked: false },
    ]);
  });

  it("buildApprovedPlanExecutePrompt points at the file without embedding the body", () => {
    const path = ".workbench/research/plans/2026-07-18-b1c2.md";
    const prompt = buildApprovedPlanExecutePrompt({
      relativePath: path,
      title: "Sorting study",
      todos: [
        { content: "Phase 1 — Design", status: "pending" },
        { content: "Phase 2 — Coverage", status: "pending" },
      ],
    });
    expect(prompt).toContain(path);
    expect(prompt).toContain("Title: Sorting study");
    expect(prompt).toContain("FIRST** tool call this turn must be `todowrite`");
    expect(prompt).toContain("Phase 1 — Design");
    expect(prompt).toContain("Phase 2 — Coverage");
    expect(prompt).not.toContain("N=100 is thin");
    expect(prompt).not.toContain("Approved plan:");
    expect(buildApprovedPlanExecuteDisplayText({ relativePath: path, title: "Sorting study" }))
      .toBe("Approved & Execute — Sorting study");
  });

  it("extractPlanFrontmatterDescription reads only frontmatter description", () => {
    const md = `---
id: a3f2
status: draft
title: Demo
description: "Fix reproducibility and re-run Bubble vs Quick benchmarks."
createdAt: 2026-07-18T08:00:00.000Z
updatedAt: 2026-07-18T08:00:00.000Z
---

# Demo

## Analysis

We will redesign the sampling protocol and validate on a pilot cohort.

## Plan

- [ ] Phase 1: Design
`;
    expect(extractPlanFrontmatterDescription(md)).toBe(
      "Fix reproducibility and re-run Bubble vs Quick benchmarks.",
    );
    expect(extractPlanFrontmatterDescription(md)).not.toContain("sampling protocol");
  });

  it("serializeResearchPlan round-trips frontmatter description", () => {
    const markdown = serializeResearchPlan({
      ...sampleDoc,
      meta: {
        ...sampleDoc.meta,
        description: "Pilot the new sampling protocol end-to-end.",
      },
      body: "# Experiment design\n\n## Analysis\n\nBody text.\n",
      steps: [],
    });
    expect(markdown).toContain("description:");
    const parsed = parseResearchPlan(markdown);
    expect(parsed?.meta.description).toBe("Pilot the new sampling protocol end-to-end.");
  });

  it("buildPlanModeTurnAppendix is path-only (structure hints on accept/kick)", () => {
    const appendix = buildPlanModeTurnAppendix("ses_demo");
    expect(appendix).toContain(sessionDraftPlanRel("ses_demo"));
    expect(appendix).toContain("chat text is not the plan");
    expect(appendix).toMatch(/Task\/Expert subagents are allowed/i);
    expect(appendix).not.toContain(PLAN_DOC_STRUCTURE_HINTS);
    expect(appendix).not.toContain("depth ≤ 2");
    expect(appendix).not.toContain("Immediately call todowrite");
    expect(appendix).not.toContain("SESSION_ID");
  });

  it("planDraftMissingRedirectNote hard-requires write + structure hints", () => {
    const note = planDraftMissingRedirectNote("ses_demo");
    expect(note).toContain("BINDING VIOLATION");
    expect(note).toContain(sessionDraftPlanRel("ses_demo"));
    expect(note).toContain("write or edit");
    expect(note).toContain("Immediately write the full plan body");
    expect(note).toContain(PLAN_DOC_STRUCTURE_HINTS);
  });

  it("buildPlanModeTurnAppendix without sessionId does not emit SESSION_ID placeholder", () => {
    const appendix = buildPlanModeTurnAppendix(null);
    expect(appendix).not.toContain("SESSION_ID");
    expect(appendix).not.toContain("drafts/");
    expect(appendix).toContain("session is not bound yet");
  });

  it("sessionDraftPlanRel / draftPlanPathBelongsToSession", () => {
    const rel = sessionDraftPlanRel("ses_abc");
    expect(rel).toBe(".workbench/research/plans/drafts/ses_abc.md");
    expect(draftPlanPathBelongsToSession(rel, "ses_abc")).toBe(true);
    expect(draftPlanPathBelongsToSession(rel, "ses_other")).toBe(false);
    expect(draftPlanPathBelongsToSession(DRAFT_PLAN_REL, "ses_abc")).toBe(false);
  });
});
