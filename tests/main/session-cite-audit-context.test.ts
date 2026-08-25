import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildSessionCiteAuditTurnAppendix,
  buildTaskDelegationCiteAuditPreface,
  recordCiteAuditHealth,
  readSessionCiteAuditSnapshotForTests,
} from "../../src/main/session/session-cite-audit-context";
import { setWorkbenchUserHomeOverride } from "../../src/main/workbench/home";

describe("session-cite-audit-context", () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "prism-cite-audit-home-"));
    setWorkbenchUserHomeOverride(home);
  });

  afterEach(() => {
    setWorkbenchUserHomeOverride(null);
    rmSync(home, { recursive: true, force: true });
  });

  it("persists a unified citation-health snapshot per session", () => {
    recordCiteAuditHealth("sess-1", {
      bibCheck: {
        texFilesScanned: 1,
        bibPath: "refs.bib",
        citeKeysInTex: ["foo", "bar"],
        keysInBib: ["foo"],
        missingKeys: ["baz"],
        unusedKeys: [],
        duplicateKeys: [],
      },
      libraryCheck: {
        texFilesScanned: 1,
        citeKeysInTex: ["foo", "bar"],
        knownKeys: ["foo"],
        missingKeys: ["bar"],
        unusedKeys: [],
      },
      bibFallback: [{ bibkey: "bar", title: null, doi: null, arxivId: null, canImportFromBib: false }],
      bibKeysNotInLibrary: ["qux"],
    });

    const snapshot = readSessionCiteAuditSnapshotForTests("sess-1");
    expect(snapshot?.health?.missingInLibrary).toEqual(["bar"]);
    expect(snapshot?.health?.missingInBib).toEqual(["baz"]);
    expect(snapshot?.health?.bibFallbackCount).toBe(1);
    expect(snapshot?.health?.bibKeysNotInLibrary).toEqual(["qux"]);
  });

  it("builds turn appendix and task preface from snapshot", () => {
    recordCiteAuditHealth("sess-2", {
      bibCheck: {
        texFilesScanned: 1,
        bibPath: "manuscript/refs.bib",
        citeKeysInTex: [],
        keysInBib: [],
        missingKeys: ["missing1"],
        unusedKeys: ["unused1"],
        duplicateKeys: [],
      },
      libraryCheck: {
        texFilesScanned: 1,
        citeKeysInTex: [],
        knownKeys: [],
        missingKeys: [],
        unusedKeys: [],
      },
      bibFallback: [],
      bibKeysNotInLibrary: [],
    });

    const appendix = buildSessionCiteAuditTurnAppendix("sess-2");
    expect(appendix).toContain("## Session citation audit (this chat)");
    expect(appendix).toContain("missing1");
    expect(appendix).toContain("citation-health");

    const preface = buildTaskDelegationCiteAuditPreface("sess-2");
    expect(preface).toContain("Session citation audit (parent session)");
    expect(preface).toContain("missing1");
  });

  it("skips recording when bridge returns error", () => {
    recordCiteAuditHealth("sess-3", { error: "boom" } as Record<string, unknown>);
    expect(readSessionCiteAuditSnapshotForTests("sess-3")).toBeNull();
  });
});
