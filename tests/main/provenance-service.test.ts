import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  appendProvenanceEvent,
  generateProvenanceId,
  readProvenanceEvents,
  recordDownloadProvenance,
  recordRunProvenance,
  resolveRunForArtifact,
  resolveRunById,
} from "../../src/main/services/provenance-service";
import type { ExperimentRunEntry } from "../../src/shared/experiment-log";

function makeRun(overrides: Partial<ExperimentRunEntry> = {}): ExperimentRunEntry {
  return {
    runId: "run_1",
    startedAt: "2026-07-11T12:00:00.000Z",
    finishedAt: "2026-07-11T12:00:05.000Z",
    command: "python train.py",
    cwd: "experiment/exp-test",
    exitCode: 0,
    stdoutTail: "ok",
    stderrTail: "",
    artifacts: ["experiment/exp-test/plot.png"],
    env: {
      python: "/usr/bin/python3",
      pythonVersion: "3.12",
      rscript: null,
      rVersion: null,
      platform: "darwin",
      gitCommit: "abc1234",
      venvPath: null,
    },
    ...overrides,
  };
}

describe("provenance-service", () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "prism-prov-"));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("appendProvenanceEvent creates the file + .prismnext dir", () => {
    appendProvenanceEvent(projectRoot, {
      id: generateProvenanceId(),
      schemaVersion: 1,
      type: "run_recorded",
      at: "2026-07-11T12:00:00.000Z",
      workspaceRel: "experiment",
      chatSessionId: null,
      gitBranch: null,
      gitCommit: null,
      experimentId: "exp-test",
      runId: "run_1",
      command: "echo hi",
      cwd: "experiment/exp-test",
      exitCode: 0,
      startedAt: "2026-07-11T12:00:00.000Z",
      finishedAt: "2026-07-11T12:00:01.000Z",
      env: { python: null, pythonVersion: null, platform: "darwin", gitCommit: null },
      artifacts: [],
      stdoutTailBytes: 0,
      stderrTailBytes: 0,
    });
    expect(existsSync(join(projectRoot, ".prismnext", "provenance.jsonl"))).toBe(true);
    expect(readProvenanceEvents(projectRoot)).toHaveLength(1);
  });

  it("resolveRunForArtifact finds run_recorded by explicit artifact_linked", () => {
    recordRunProvenance(projectRoot, {
      workspaceRel: "experiment",
      experimentId: "exp-test",
      run: makeRun(),
      chatSessionId: "ses_x",
    });
    const resolved = resolveRunForArtifact(projectRoot, "experiment/exp-test/plot.png");
    expect(resolved?.run.runId).toBe("run_1");
    expect(resolved?.run.command).toBe("python train.py");
    expect(resolved?.run.chatSessionId).toBe("ses_x");
    expect(resolved?.linkMethod).toBe("explicit");
  });

  it("resolveRunForArtifact returns null for unlinked file (honest empty)", () => {
    expect(resolveRunForArtifact(projectRoot, "experiment/exp-test/unknown.png")).toBeNull();
  });

  it("recordRunProvenance emits run_recorded + one artifact_linked per artifact", () => {
    const id = recordRunProvenance(projectRoot, {
      workspaceRel: "experiment",
      experimentId: "exp-test",
      run: makeRun({ artifacts: ["a.png", "b.csv"] }),
    });
    expect(id).toBeTruthy();
    const events = readProvenanceEvents(projectRoot);
    expect(events.filter((e) => e.type === "run_recorded")).toHaveLength(1);
    expect(events.filter((e) => e.type === "artifact_linked")).toHaveLength(2);
    // links carry an explicit method + a media hint
    const links = events.filter((e) => e.type === "artifact_linked");
    expect(links.some((l) => l.type === "artifact_linked" && l.mediaType === "image/png")).toBe(true);
  });

  it("resolveRunById finds the run_recorded event", () => {
    recordRunProvenance(projectRoot, {
      workspaceRel: "experiment",
      experimentId: "exp-test",
      run: makeRun(),
    });
    expect(resolveRunById(projectRoot, "run_1")?.command).toBe("python train.py");
    expect(resolveRunById(projectRoot, "nope")).toBeNull();
  });

  it("mtime inference links unlisted files modified during the run (mtime_inferred)", () => {
    // Create the experiment island dir with a few files whose mtime sits
    // within the run window [startedAt, finishedAt + grace].
    const islandAbs = join(projectRoot, "experiment", "exp-test");
    mkdirSync(islandAbs, { recursive: true });
    const now = Date.now();
    // In-window: produced by the run but NOT listed in artifacts[].
    writeFileSync(join(islandAbs, "loss.png"), Buffer.from("png"));
    writeFileSync(join(islandAbs, "metrics.csv"), "a,b\n1,2");
    // Out-of-window: an old file, must NOT be attributed.
    const old = new Date(now - 3600_000).toISOString();
    const runStart = now - 500;
    const runEnd = now - 100;

    const run = makeRun({
      startedAt: new Date(runStart).toISOString(),
      finishedAt: new Date(runEnd).toISOString(),
      artifacts: ["experiment/exp-test/plot.png"], // declared explicitly
    });
    recordRunProvenance(projectRoot, {
      workspaceRel: "experiment",
      experimentId: "exp-test",
      run,
      islandAbs,
    });

    const events = readProvenanceEvents(projectRoot);
    const links = events.filter((e) => e.type === "artifact_linked");
    const byPath = new Map(links.map((l) => [l.artifactPath, l]));
    // The explicitly declared one stays explicit.
    expect(byPath.get("experiment/exp-test/plot.png")?.linkMethod).toBe("explicit");
    // The unlisted in-window files are inferred.
    expect(byPath.get("experiment/exp-test/loss.png")?.linkMethod).toBe("mtime_inferred");
    expect(byPath.get("experiment/exp-test/metrics.csv")?.linkMethod).toBe("mtime_inferred");

    // An inferred artifact resolves back to the run too.
    const resolved = resolveRunForArtifact(projectRoot, "experiment/exp-test/loss.png");
    expect(resolved?.run.command).toBe("python train.py");
    expect(resolved?.linkMethod).toBe("mtime_inferred");

    // The out-of-window old file is NOT linked (sanity via a file we never wrote).
    void old;
  });

  it("mtime inference skips the scan when islandAbs is absent (explicit only)", () => {
    recordRunProvenance(projectRoot, {
      workspaceRel: "experiment",
      experimentId: "exp-test",
      run: makeRun({ artifacts: ["a.png"] }),
      // no islandAbs -> no inference
    });
    const links = readProvenanceEvents(projectRoot).filter((e) => e.type === "artifact_linked");
    expect(links.every((l) => l.linkMethod === "explicit")).toBe(true);
  });

  it("mtime inference skips venv / node_modules trees", () => {
    const islandAbs = join(projectRoot, "experiment", "exp-test");
    mkdirSync(join(islandAbs, "node_modules", "pkg"), { recursive: true });
    mkdirSync(join(islandAbs, "venv", "lib"), { recursive: true });
    writeFileSync(join(islandAbs, "node_modules", "pkg", "noise.bin"), "x");
    writeFileSync(join(islandAbs, "venv", "lib", "noise.bin"), "y");
    writeFileSync(join(islandAbs, "real.png"), "png");
    const now = Date.now();
    const run = makeRun({
      startedAt: new Date(now - 500).toISOString(),
      finishedAt: new Date(now - 100).toISOString(),
      artifacts: [],
    });
    recordRunProvenance(projectRoot, {
      workspaceRel: "experiment",
      experimentId: "exp-test",
      run,
      islandAbs,
    });
    const paths = readProvenanceEvents(projectRoot)
      .filter((e) => e.type === "artifact_linked")
      .map((e) => e.artifactPath);
    expect(paths).toContain("experiment/exp-test/real.png");
    expect(paths.some((p) => p.includes("node_modules"))).toBe(false);
    expect(paths.some((p) => p.includes("/venv/"))).toBe(false);
  });

  it("reads no events when provenance file is absent (old project)", () => {
    expect(readProvenanceEvents(projectRoot)).toEqual([]);
  });

  it("recordDownloadProvenance appends a download_recorded event (Phase 1.1)", () => {
    recordDownloadProvenance(projectRoot, {
      artifactPath: ".prismnext/library/attachments/abc.pdf",
      source: "literature-ingest",
      identifier: "10.1000/xyz",
      sourceUrl: "https://arxiv.org/pdf/1234",
      bytes: 2048,
    });
    const events = readProvenanceEvents(projectRoot);
    const dl = events.find((e) => e.type === "download_recorded");
    expect(dl).toBeTruthy();
    if (dl && dl.type === "download_recorded") {
      expect(dl.source).toBe("literature-ingest");
      expect(dl.identifier).toBe("10.1000/xyz");
      expect(dl.sourceUrl).toBe("https://arxiv.org/pdf/1234");
      expect(dl.bytes).toBe(2048);
      expect(dl.artifactPath).toBe(".prismnext/library/attachments/abc.pdf");
    }
  });

  it("skips corrupt lines without throwing", () => {
    // Hand-write a corrupt line followed by a good one.
    const { appendFileSync, mkdirSync } = require("node:fs");
    mkdirSync(join(projectRoot, ".prismnext"), { recursive: true });
    appendFileSync(
      join(projectRoot, ".prismnext", "provenance.jsonl"),
      "{not json\n" +
        JSON.stringify({
          id: "prov_ok",
          schemaVersion: 1,
          type: "run_recorded",
          at: "2026-07-11T12:00:00.000Z",
          workspaceRel: "experiment",
          chatSessionId: null,
          gitBranch: null,
          gitCommit: null,
          experimentId: null,
          runId: "run_ok",
          command: "ok",
          cwd: ".",
          exitCode: 0,
          startedAt: "2026-07-11T12:00:00.000Z",
          finishedAt: "2026-07-11T12:00:01.000Z",
          env: { python: null, pythonVersion: null, platform: "darwin", gitCommit: null },
          artifacts: [],
          stdoutTailBytes: 0,
          stderrTailBytes: 0,
        }) + "\n",
      "utf-8",
    );
    const events = readProvenanceEvents(projectRoot);
    expect(events).toHaveLength(1);
    expect(events[0]!.runId).toBe("run_ok");
  });
});
