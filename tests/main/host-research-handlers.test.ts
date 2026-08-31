import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { createHostContext, dispatchHostMethod } from "../../src/host/handler-registry";
import { sessionDraftPlanRel } from "../../src/shared/research/plan";

describe("host research plan handlers", () => {
  it("claims a session draft written on the bound remote root", async () => {
    const paper = mkdtempSync(join(tmpdir(), "prism-host-plan-"));
    const sessionId = "sess-plan-1";
    const rel = sessionDraftPlanRel(sessionId);
    const abs = join(paper, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(
      abs,
      [
        "---",
        "id: abcd",
        "status: draft",
        `sessionId: ${sessionId}`,
        "title: Remote draft",
        "description: Approve this on the Host",
        "---",
        "",
        "# Remote draft",
        "",
        "- [ ] Step one",
        "",
      ].join("\n"),
    );
    const ctx = createHostContext();
    ctx.remoteRoot = paper;
    const claimed = await dispatchHostMethod(
      "researchPlan:claimDraft",
      { projectRoot: paper, sessionId },
      ctx,
    ) as { ok?: boolean; owned?: boolean; relativePath?: string; title?: string };
    expect(claimed.ok).toBe(true);
    expect(claimed.owned).toBe(true);
    expect(claimed.relativePath).toBe(rel);
    expect(claimed.title).toBe("Remote draft");

    const read = await dispatchHostMethod(
      "researchPlan:readDraft",
      { projectRoot: paper, sessionId },
      ctx,
    ) as { ok?: boolean; exists?: boolean; markdown?: string };
    expect(read.ok).toBe(true);
    expect(read.exists).toBe(true);
    expect(read.markdown).toContain("Step one");
  });
});
