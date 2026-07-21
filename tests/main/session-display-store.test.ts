import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  appendUserDisplay,
  appendPlanDecisionEvent,
  getUserDisplays,
  getPlanEvents,
  markLatestPlanArtifactDiscarded,
  truncateUserDisplays,
  deleteSessionDisplays,
  restoreUserDisplays,
  upsertPlanArtifactEvent,
} from "../../src/main/services/session-display-store";

describe("session-display-store", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "prism-display-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("appends and reads user display snapshots per session", () => {
    const content = [{ type: "text", text: "@main.tex", inlineParts: [{ type: "text", text: "" }] }];
    appendUserDisplay(tmpDir, "sess-1", content);
    appendUserDisplay(tmpDir, "sess-1", [{ type: "text", text: "second" }]);

    expect(getUserDisplays(tmpDir, "sess-1")).toHaveLength(2);
    expect(getUserDisplays(tmpDir, "sess-1")[0]).toEqual(content);
  });

  it("truncates and deletes session displays", () => {
    appendUserDisplay(tmpDir, "sess-2", [{ type: "text", text: "a" }]);
    appendUserDisplay(tmpDir, "sess-2", [{ type: "text", text: "b" }]);
    truncateUserDisplays(tmpDir, "sess-2", 1);
    expect(getUserDisplays(tmpDir, "sess-2")).toHaveLength(1);

    deleteSessionDisplays(tmpDir, "sess-2");
    expect(getUserDisplays(tmpDir, "sess-2")).toHaveLength(0);
  });

  it("restores full display list", () => {
    appendUserDisplay(tmpDir, "sess-3", [{ type: "text", text: "a" }]);
    appendUserDisplay(tmpDir, "sess-3", [{ type: "text", text: "b" }]);
    truncateUserDisplays(tmpDir, "sess-3", 1);
    restoreUserDisplays(tmpDir, "sess-3", [
      [{ type: "text", text: "a" }],
      [{ type: "text", text: "b" }],
    ]);
    expect(getUserDisplays(tmpDir, "sess-3")).toHaveLength(2);
  });

  it("persists plan artifact upsert and discarded mark", () => {
    upsertPlanArtifactEvent(tmpDir, "sess-plan", {
      kind: "plan-artifact",
      path: ".prismnext/research/plans/current-draft.md",
      title: "T1",
      afterIndex: 2,
    });
    upsertPlanArtifactEvent(tmpDir, "sess-plan", {
      kind: "plan-artifact",
      path: ".prismnext/research/plans/2026-07-18-ab12.md",
      title: "T1",
      afterIndex: 2,
    });
    expect(getPlanEvents(tmpDir, "sess-plan")).toHaveLength(1);
    expect(getPlanEvents(tmpDir, "sess-plan")[0]).toMatchObject({
      kind: "plan-artifact",
      path: ".prismnext/research/plans/2026-07-18-ab12.md",
    });

    markLatestPlanArtifactDiscarded(tmpDir, "sess-plan");
    appendPlanDecisionEvent(tmpDir, "sess-plan", {
      kind: "plan-decision",
      decision: "rejected",
      title: "T1",
      afterIndex: 2,
    });
    const events = getPlanEvents(tmpDir, "sess-plan");
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ kind: "plan-artifact", discarded: true, path: "" });
    expect(events[1]).toMatchObject({ kind: "plan-decision", decision: "rejected" });
  });
});
