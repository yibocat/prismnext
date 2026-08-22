import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  claimDraftForSession,
  discardDraftPlan,
  ensureResearchPlansDir,
  promoteDraftPlan,
  readDraftPlan,
  sessionDraftMetaShowsWrite,
  sessionHasPendingPlanDraft,
  snapshotSessionDraftMeta,
  writeResearchPlan,
} from "../../src/main/services/research-plan-service";
import {
  LEGACY_DRAFT_PLAN_REL,
  RESEARCH_PLANS_DIR_REL,
  parseResearchPlan,
  researchPlanFileName,
  sessionDraftPlanRel,
  type ResearchPlanDoc,
} from "../../src/shared/research/plan";

describe("research-plan-service", () => {
  let root: string;

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it("ensureResearchPlansDir creates .workbench/research/plans", () => {
    root = mkdtempSync(join(tmpdir(), "prism-plan-"));
    const dir = ensureResearchPlansDir(root);
    expect(dir).toBe(join(root, RESEARCH_PLANS_DIR_REL));
    expect(existsSync(dir)).toBe(true);
  });

  it("writeResearchPlan writes approved plan under plans/", () => {
    root = mkdtempSync(join(tmpdir(), "prism-plan-"));
    const doc: ResearchPlanDoc = {
      meta: {
        id: "b1c4",
        status: "approved",
        createdAt: "2026-07-18T10:00:00.000Z",
        updatedAt: "2026-07-18T10:00:00.000Z",
        title: "Approved plan",
      },
      goal: "Ship the feature.",
      steps: [{ text: "Implement service" }],
    };

    const result = writeResearchPlan(root, doc);
    expect(result.ok).toBe(true);
    expect(result.relativePath).toBe(`${RESEARCH_PLANS_DIR_REL}/${researchPlanFileName(doc.meta)}`);
    expect(existsSync(result.absolutePath)).toBe(true);

    const parsed = parseResearchPlan(readFileSync(result.absolutePath, "utf-8"));
    expect(parsed?.meta.status).toBe("approved");
    expect(parsed?.meta.id).toBe("b1c4");
    expect(parsed?.goal).toBe("Ship the feature.");
  });

  it("writeResearchPlan writes per-session draft under drafts/", () => {
    root = mkdtempSync(join(tmpdir(), "prism-plan-"));
    const sessionId = "ses_abc";
    const draftRel = sessionDraftPlanRel(sessionId);

    const first = writeResearchPlan(root, {
      meta: {
        id: "draft1",
        status: "draft",
        sessionId,
        createdAt: "2026-07-18T09:00:00.000Z",
        updatedAt: "2026-07-18T09:00:00.000Z",
      },
      steps: [{ text: "First draft step" }],
    });
    expect(first.relativePath).toBe(draftRel);

    const second = writeResearchPlan(root, {
      meta: {
        id: "draft1",
        status: "draft",
        sessionId,
        createdAt: "2026-07-18T09:00:00.000Z",
        updatedAt: "2026-07-18T09:00:00.000Z",
      },
      steps: [{ text: "Revised draft step" }],
    });

    expect(second.absolutePath).toBe(first.absolutePath);
    expect(existsSync(join(root, draftRel))).toBe(true);

    const parsed = parseResearchPlan(readFileSync(join(root, draftRel), "utf-8"));
    expect(parsed?.steps).toEqual([{ text: "Revised draft step" }]);
    expect(parsed?.meta.sessionId).toBe(sessionId);
  });

  it("writeResearchPlan generates id and updatedAt when missing", () => {
    root = mkdtempSync(join(tmpdir(), "prism-plan-"));
    const result = writeResearchPlan(root, {
      meta: {
        id: "",
        status: "snapshot",
        createdAt: "",
        updatedAt: "",
      },
      steps: [{ text: "Snapshot step" }],
    });

    expect(result.ok).toBe(true);
    const parsed = parseResearchPlan(readFileSync(result.absolutePath, "utf-8"));
    expect(parsed?.meta.id).toMatch(/^[a-f0-9]{4}$/);
    expect(parsed?.meta.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(parsed?.meta.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(parsed?.meta.status).toBe("snapshot");
  });

  it("readDraftPlan and promoteDraftPlan rename session draft to approved plan of record", () => {
    root = mkdtempSync(join(tmpdir(), "prism-plan-"));
    const sessionId = "ses_1";
    const draftRel = sessionDraftPlanRel(sessionId);
    writeResearchPlan(root, {
      meta: {
        id: "d1",
        status: "draft",
        sessionId,
        createdAt: "2026-07-18T09:00:00.000Z",
        updatedAt: "2026-07-18T09:00:00.000Z",
        title: "Experiment improvement plan",
      },
      body: `# Experiment improvement plan

## Stage 1
- Fix SMOKE data
- Re-run full benchmark
`,
    });

    const read = readDraftPlan(root, sessionId);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.empty).toBe(false);
    expect(read.title).toContain("Experiment");
    expect(read.relativePath).toBe(draftRel);

    const promoted = promoteDraftPlan(root, { sessionId });
    expect(promoted.ok).toBe(true);
    if (!promoted.ok) return;
    expect(promoted.relativePath).toMatch(
      /\.workbench\/research\/plans\/\d{4}-\d{2}-\d{2}-[a-f0-9]{4}\.md$/,
    );
    expect(existsSync(promoted.absolutePath)).toBe(true);
    expect(existsSync(join(root, draftRel))).toBe(false);

    const parsed = parseResearchPlan(readFileSync(promoted.absolutePath, "utf-8"));
    expect(parsed?.meta.status).toBe("approved");
    expect(parsed?.body).toContain("Stage 1");
    expect(parsed?.body).toContain("Fix SMOKE data");
  });

  it("promoteDraftPlan fails when draft is empty", () => {
    root = mkdtempSync(join(tmpdir(), "prism-plan-"));
    const result = promoteDraftPlan(root, { sessionId: "ses_empty" });
    expect(result.ok).toBe(false);
  });

  it("discardDraftPlan deletes the session draft and leaves no snapshot", () => {
    root = mkdtempSync(join(tmpdir(), "prism-plan-"));
    const sessionId = "ses_discard";
    const draftRel = sessionDraftPlanRel(sessionId);
    writeResearchPlan(root, {
      meta: {
        id: "d2",
        status: "draft",
        sessionId,
        createdAt: "2026-07-18T09:00:00.000Z",
        updatedAt: "2026-07-18T09:00:00.000Z",
      },
      body: "# Discard me\n",
    });

    const result = discardDraftPlan(root, sessionId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.discarded).toBe(true);
    expect(existsSync(join(root, draftRel))).toBe(false);
    expect(existsSync(join(root, RESEARCH_PLANS_DIR_REL))).toBe(true);
  });

  it("sessions do not share draft files", () => {
    root = mkdtempSync(join(tmpdir(), "prism-plan-"));
    writeResearchPlan(root, {
      meta: {
        id: "a",
        status: "draft",
        sessionId: "ses_a",
        createdAt: "2026-07-18T09:00:00.000Z",
        updatedAt: "2026-07-18T09:00:00.000Z",
      },
      body: "# Plan A\n",
    });
    writeResearchPlan(root, {
      meta: {
        id: "b",
        status: "draft",
        sessionId: "ses_b",
        createdAt: "2026-07-18T09:00:00.000Z",
        updatedAt: "2026-07-18T09:00:00.000Z",
      },
      body: "# Plan B\n",
    });

    const a = readDraftPlan(root, "ses_a");
    const b = readDraftPlan(root, "ses_b");
    expect(a.ok && a.markdown).toContain("Plan A");
    expect(b.ok && b.markdown).toContain("Plan B");
    expect(sessionHasPendingPlanDraft(root, "ses_a")).toBe(true);
    expect(sessionHasPendingPlanDraft(root, "ses_c")).toBe(false);

    const blocked = promoteDraftPlan(root, { sessionId: "ses_b" });
    expect(blocked.ok).toBe(true);
    if (!blocked.ok) return;
    expect(existsSync(join(root, sessionDraftPlanRel("ses_a")))).toBe(true);
    expect(existsSync(join(root, sessionDraftPlanRel("ses_b")))).toBe(false);
  });

  it("claimDraftForSession migrates legacy current-draft.md into session draft", () => {
    root = mkdtempSync(join(tmpdir(), "prism-plan-"));
    ensureResearchPlansDir(root);
    const legacyAbs = join(root, LEGACY_DRAFT_PLAN_REL);
    writeFileSync(legacyAbs, "# Owned plan\n\n## Analysis\n\nx\n", "utf-8");

    const claimed = claimDraftForSession(root, "ses_a");
    expect(claimed.ok).toBe(true);
    if (!claimed.ok) return;
    expect(claimed.owned).toBe(true);
    expect(claimed.relativePath).toBe(sessionDraftPlanRel("ses_a"));

    const read = readDraftPlan(root, "ses_a");
    expect(read.ok && read.sessionId).toBe("ses_a");
    expect(existsSync(join(root, sessionDraftPlanRel("ses_a")))).toBe(true);

    const other = claimDraftForSession(root, "ses_b");
    expect(other.ok).toBe(true);
    if (!other.ok) return;
    // ses_b has no draft of its own; legacy already migrated to ses_a
    expect(other.owned).toBe(false);
  });

  it("claimDraftForSession migrates agent-invented drafts/* filenames", () => {
    root = mkdtempSync(join(tmpdir(), "prism-plan-"));
    const sessionId = "ses_orphan";
    const orphanRel = `${RESEARCH_PLANS_DIR_REL}/drafts/exp-improvement-plan-20260718.md`;
    const orphanAbs = join(root, orphanRel);
    mkdirSync(join(root, RESEARCH_PLANS_DIR_REL, "drafts"), { recursive: true });
    writeFileSync(
      orphanAbs,
      `# Experiment improvement\n\n## Analysis\n\nx\n\n## Plan\n\n- step\n\n## Checklist\n\n- [ ] step\n`,
      "utf-8",
    );

    const claimed = claimDraftForSession(root, sessionId);
    expect(claimed.ok).toBe(true);
    if (!claimed.ok) return;
    expect(claimed.owned).toBe(true);
    expect(claimed.relativePath).toBe(sessionDraftPlanRel(sessionId));
    expect(existsSync(join(root, sessionDraftPlanRel(sessionId)))).toBe(true);
    expect(existsSync(orphanAbs)).toBe(false);

    const ready = sessionHasPendingPlanDraft(root, sessionId);
    expect(ready).toBe(true);
  });

  it("snapshotSessionDraftMeta / sessionDraftMetaShowsWrite detect draft writes", () => {
    root = mkdtempSync(join(tmpdir(), "prism-plan-"));
    const sessionId = "ses_snap";
    const before = snapshotSessionDraftMeta(root, sessionId);
    expect(before.exists).toBe(false);
    expect(before.empty).toBe(true);
    expect(sessionDraftMetaShowsWrite(before, before)).toBe(false);

    const abs = join(root, sessionDraftPlanRel(sessionId));
    mkdirSync(join(root, RESEARCH_PLANS_DIR_REL, "drafts"), { recursive: true });
    writeFileSync(abs, "## Analysis\n\nx\n\n## Plan\n\n- a\n\n## Checklist\n\n- [ ] a\n", "utf-8");
    const afterCreate = snapshotSessionDraftMeta(root, sessionId);
    expect(afterCreate.exists).toBe(true);
    expect(afterCreate.empty).toBe(false);
    expect(sessionDraftMetaShowsWrite(before, afterCreate)).toBe(true);

    writeFileSync(abs, "## Analysis\n\ny\n\n## Plan\n\n- b\n\n## Checklist\n\n- [ ] b\n", "utf-8");
    const afterEdit = snapshotSessionDraftMeta(root, sessionId);
    expect(sessionDraftMetaShowsWrite(afterCreate, afterEdit)).toBe(true);
  });
});
