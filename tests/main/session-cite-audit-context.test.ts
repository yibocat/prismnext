import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildSessionCiteAuditTurnAppendix,
  buildTaskDelegationCiteAuditPreface,
  recordCiteAuditBibCheck,
  recordCiteAuditLibraryCheck,
  readSessionCiteAuditSnapshotForTests,
} from "../../src/main/services/session-cite-audit-context";

describe("session-cite-audit-context", () => {
  let bridgeRoot: string;
  const prevBridge = process.env.PRISM_LITERATURE_BRIDGE_ROOT;

  beforeEach(() => {
    bridgeRoot = mkdtempSync(join(tmpdir(), "prism-cite-audit-"));
    process.env.PRISM_LITERATURE_BRIDGE_ROOT = bridgeRoot;
  });

  afterEach(() => {
    if (prevBridge === undefined) delete process.env.PRISM_LITERATURE_BRIDGE_ROOT;
    else process.env.PRISM_LITERATURE_BRIDGE_ROOT = prevBridge;
    rmSync(bridgeRoot, { recursive: true, force: true });
  });

  it("persists library and bib check snapshots per session", () => {
    recordCiteAuditLibraryCheck("sess-1", {
      citeKeysInTex: ["foo", "bar"],
      missingKeys: ["bar"],
      bibPath: "refs.bib",
      bibFallback: [{ citekey: "bar" }],
    });
    recordCiteAuditBibCheck("sess-1", {
      bibPath: "refs.bib",
      missingKeys: ["baz"],
      duplicateKeys: [],
      libraryCheck: { missingKeys: ["bar"] },
    });

    const snapshot = readSessionCiteAuditSnapshotForTests("sess-1");
    expect(snapshot?.libraryCheck?.missingKeys).toEqual(["bar"]);
    expect(snapshot?.bibCheck?.missingKeys).toEqual(["baz"]);
    expect(snapshot?.libraryCheck?.bibFallbackCount).toBe(1);
  });

  it("builds turn appendix and task preface from snapshot", () => {
    recordCiteAuditBibCheck("sess-2", {
      bibPath: "manuscript/refs.bib",
      missingKeys: ["missing1"],
      unusedKeys: ["unused1"],
      duplicateKeys: [],
    });

    const appendix = buildSessionCiteAuditTurnAppendix("sess-2");
    expect(appendix).toContain("## Session citation audit (this chat)");
    expect(appendix).toContain("missing1");
    expect(appendix).toContain("latex-bib-check");

    const preface = buildTaskDelegationCiteAuditPreface("sess-2");
    expect(preface).toContain("Session citation audit (parent session)");
    expect(preface).toContain("missing1");
  });

  it("skips recording when bridge returns error", () => {
    recordCiteAuditLibraryCheck("sess-3", { error: "boom" });
    expect(readSessionCiteAuditSnapshotForTests("sess-3")).toBeNull();
  });
});
