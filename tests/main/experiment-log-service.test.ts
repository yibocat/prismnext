import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appendRun,
  archiveExperiment,
  buildExperimentStorageContext,
  createExperiment,
  deleteExperiment,
  detectEnvForIsland,
  extractCdTargets,
  generateExperimentSlug,
  listExperiments,
  readExperiment,
  restoreExperiment,
} from "../../src/main/services/experiment-log-service";
import { resolveExperimentDir } from "../../src/main/services/workspace-config";
import {
  readProvenanceEvents,
  resolveRunForArtifact,
} from "../../src/main/services/provenance-service";
import {
  EXPERIMENT_REGISTRY_REL,
  experimentEnvDisplayRows,
  slugBaseFromTitle,
} from "../../src/shared/experiment-log";

describe("experiment-log-service", () => {
  let root: string;
  let ctx: ReturnType<typeof buildExperimentStorageContext>;

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  function setup(): ReturnType<typeof buildExperimentStorageContext> {
    root = mkdtempSync(join(tmpdir(), "prism-exp-"));
    const experimentRoot = join(root, "experiment");
    mkdirSync(experimentRoot, { recursive: true });
    ctx = buildExperimentStorageContext(root, "experiment");
    return ctx;
  }

  it("slugBaseFromTitle kebab-cases and truncates", () => {
    expect(slugBaseFromTitle("Learning Rate Ablation!")).toBe("learning-rate-ablation");
    expect(slugBaseFromTitle("   ")).toBe("experiment");
    const long = slugBaseFromTitle("a".repeat(100));
    expect(long.length).toBeLessThanOrEqual(24);
  });

  it("generateExperimentSlug produces exp-YYYYMMDD-base-shortid and is unique", () => {
    const c = setup();
    const slug = generateExperimentSlug(c.registryRoot, "LR Ablation");
    expect(slug).toMatch(/^exp-\d{8}-lr-ablation-[0-9a-f]{4}$/);
    const slug2 = generateExperimentSlug(c.registryRoot, "LR Ablation");
    expect(slug2).not.toBe(slug);
  });

  it("createExperiment scaffolds registry + empty workspace folder (split storage)", () => {
    const c = setup();
    const result = createExperiment(
      c,
      {
        title: "LR ablation",
        briefLinks: { sections: ["Hypotheses / claims"], hypothesisExcerpt: "H1: lr=1e-3 wins" },
        tags: ["ablation"],
      },
      { ensureVenv: false },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.id).toMatch(/^exp-\d{8}-lr-ablation-[0-9a-f]{4}$/);
    expect(result.path).toBe(`experiment/${result.id}`);

    const registryDir = join(c.registryRoot, result.id);
    expect(existsSync(join(registryDir, "meta.json"))).toBe(true);
    expect(existsSync(join(registryDir, "runs.jsonl"))).toBe(true);

    const workspaceIsland = join(c.projectRoot, result.path);
    expect(existsSync(workspaceIsland)).toBe(true);
    expect(existsSync(join(workspaceIsland, "meta.json"))).toBe(false);
    expect(existsSync(join(workspaceIsland, "runs.jsonl"))).toBe(false);

    const meta = JSON.parse(readFileSync(join(registryDir, "meta.json"), "utf-8"));
    expect(meta.title).toBe("LR ablation");
    expect(meta.workspacePath).toBe(result.path);
    expect(meta.briefLinks.hypothesisExcerpt).toContain("H1");
    expect(meta.tags).toEqual(["ablation"]);
  });

  it("createExperiment rejects empty title", () => {
    const c = setup();
    const result = createExperiment(c, { title: "   " }, { ensureVenv: false });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("missing_title");
  });

  it("listExperiments returns created experiments from registry", () => {
    const c = setup();
    const a = createExperiment(c, { title: "A" }, { ensureVenv: false });
    const b = createExperiment(c, { title: "B" }, { ensureVenv: false });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    const list = listExperiments(c);
    expect(list.experiments.map((e) => e.id).sort()).toEqual([a.id, b.id].sort());
    expect(list.experiments[0]!.workspacePath).toMatch(/^experiment\//);
    expect(list.experiments.every((e) => e.status === "active")).toBe(true);
    expect(list.registryRoot).toBe(EXPERIMENT_REGISTRY_REL);
    expect(list.corruptIds).toEqual([]);
  });

  it("listExperiments reports corrupt / missing meta without hiding healthy rows (Bug #19)", () => {
    const c = setup();
    const good = createExperiment(c, { title: "Healthy" }, { ensureVenv: false });
    expect(good.ok).toBe(true);
    if (!good.ok) return;

    const badId = "exp-corrupt-meta";
    mkdirSync(join(c.registryRoot, badId), { recursive: true });
    writeFileSync(join(c.registryRoot, badId, "meta.json"), "{not-json", "utf-8");

    const orphanId = "exp-orphan-dir";
    mkdirSync(join(c.registryRoot, orphanId), { recursive: true });

    const list = listExperiments(c);
    expect(list.experiments.map((e) => e.id)).toEqual([good.id]);
    expect(list.corruptIds.sort()).toEqual([badId, orphanId].sort());
  });

  it("extractCdTargets handles quotes and ignores special targets (Bugs #17/#31)", () => {
    expect(extractCdTargets('cd labs/exp-demo && python train.py')).toEqual(["labs/exp-demo"]);
    expect(extractCdTargets('cd "labs/exp demo" && python train.py')).toEqual(["labs/exp demo"]);
    expect(extractCdTargets("cd 'labs/x' && uv pip install numpy")).toEqual(["labs/x"]);
    expect(extractCdTargets("cd - && python train.py")).toEqual([]);
    expect(extractCdTargets("cd $OLDPWD && python train.py")).toEqual([]);
    expect(extractCdTargets("cd ~/labs && python train.py")).toEqual([]);
  });

  it("archiveExperiment hides from human list; restore brings it back; delete removes registry (+ optional lab)", () => {
    const c = setup();
    const created = createExperiment(c, { title: "Archive me" }, { ensureVenv: false });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const { id, path: labRel } = created;
    const labAbs = join(c.projectRoot, labRel);
    writeFileSync(join(labAbs, "readme.txt"), "keep or drop");

    const archived = archiveExperiment(c, id);
    expect(archived.ok).toBe(true);
    if (!archived.ok) return;
    expect(archived.meta.status).toBe("archived");
    expect(archived.meta.archivedAt).toBeTruthy();

    expect(listExperiments(c, { includeArchived: false }).experiments).toHaveLength(0);
    const agentList = listExperiments(c, { includeArchived: true }).experiments;
    expect(agentList).toHaveLength(1);
    expect(agentList[0]!.status).toBe("archived");

    // Idempotent archive
    expect(archiveExperiment(c, id).ok).toBe(true);

    const restored = restoreExperiment(c, id);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.meta.status).toBe("active");
    expect(restored.meta.archivedAt).toBeNull();
    expect(listExperiments(c, { includeArchived: false }).experiments).toHaveLength(1);

    // Registry-only delete keeps the lab island
    expect(deleteExperiment(c, id).ok).toBe(true);
    expect(listExperiments(c).experiments).toHaveLength(0);
    expect(existsSync(labAbs)).toBe(true);

    const again = createExperiment(c, { title: "Wipe lab" }, { ensureVenv: false });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    const lab2 = join(c.projectRoot, again.path);
    writeFileSync(join(lab2, "script.py"), "print(1)");
    expect(deleteExperiment(c, again.id, { removeLab: true }).ok).toBe(true);
    expect(existsSync(lab2)).toBe(false);
  });

  it("deleteExperiment refuses removeLab when workspacePath is not the island id", () => {
    const c = setup();
    const created = createExperiment(c, { title: "Unsafe" }, { ensureVenv: false });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const metaPath = join(c.registryRoot, created.id, "meta.json");
    const meta = JSON.parse(readFileSync(metaPath, "utf-8")) as Record<string, unknown>;
    meta.workspacePath = "experiment/../secret";
    writeFileSync(metaPath, JSON.stringify(meta));
    const result = deleteExperiment(c, created.id, { removeLab: true });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("unsafe_lab_path");
  });

  it(
    "readExperiment returns meta + runs (tail-limited)",
    () => {
      const c = setup();
      const created = createExperiment(c, { title: "Read test" }, { ensureVenv: false });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const { id } = created;
      for (let i = 0; i < 25; i++) {
        appendRun(c, id, { command: `echo ${i}`, exitCode: 0, stdoutTail: `out${i}` });
      }
      const read = readExperiment(c, id, 5, { includeOutput: true });
      expect(read.ok).toBe(true);
      if (!read.ok) return;
      expect(read.runs.length).toBe(5);
      expect(read.runs[4]!.stdoutTail).toBe("out24");
      expect(read.runs[0]!.command).toBe("echo 20");
      expect(read.oldestRun?.command).toBe("echo 0");
      expect(read.latestRun?.command).toBe("echo 24");
      expect(read.runsOrder).toBe("chronological_oldest_first");
      expect(read.meta.title).toBe("Read test");
      expect(read.runCount).toBe(25);
      expect(read.lastRunAt).toBeTruthy();
      const statsPath = join(c.registryRoot, id, "runs.stats.json");
      expect(existsSync(statsPath)).toBe(true);
      const stats = JSON.parse(readFileSync(statsPath, "utf-8")) as { runCount: number };
      expect(stats.runCount).toBe(25);
    },
    // Heavy IO loop (25 appends + stats rewrite); can exceed the 5s default
    // under full-suite parallel load.
    15_000,
  );

  it("readExperiment lean mode strips stdout/stderr but keeps oldest/latest", () => {
    const c = setup();
    const created = createExperiment(c, { title: "Lean read" }, { ensureVenv: false });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const { id } = created;
    for (let i = 0; i < 8; i++) {
      appendRun(c, id, {
        command: `cmd ${i}`,
        exitCode: 0,
        stdoutTail: `fat-stdout-${i}-${"x".repeat(200)}`,
        stderrTail: `fat-stderr-${i}`,
        artifacts: [`fig-${i}.png`],
      });
    }
    const read = readExperiment(c, id, 3, { includeOutput: false });
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.includeOutput).toBe(false);
    expect(read.runs.length).toBe(3);
    expect(read.runs.every((r) => r.stdoutTail === "" && r.stderrTail === "")).toBe(true);
    expect(read.runs[0]!.command).toBe("cmd 5");
    expect(read.runs[2]!.artifacts.some((a) => a.endsWith("fig-7.png"))).toBe(true);
    expect(read.oldestRun?.command).toBe("cmd 0");
    expect(read.latestRun?.command).toBe("cmd 7");
    expect(read.oldestRun?.stdoutTail).toBe("");
    expect(read.latestRun?.artifacts.some((a) => a.endsWith("fig-7.png"))).toBe(true);
  });

  it("readExperiment returns experiment_not_found for unknown id", () => {
    const c = setup();
    const read = readExperiment(c, "exp-does-not-exist", 20);
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.error).toBe("experiment_not_found");
  });

  it("appendRun infers any island result files by mtime when artifacts omitted", () => {
    const c = setup();
    const created = createExperiment(c, { title: "Infer island" }, { ensureVenv: false });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const { id } = created;
    const islandDir = join(c.projectRoot, "experiment", id);
    const startedAt = new Date(Date.now() - 2000).toISOString();
    writeFileSync(join(islandDir, "local-plot.png"), "x");
    writeFileSync(join(islandDir, "metrics.json"), '{"ok":1}');
    const finishedAt = new Date().toISOString();
    const r = appendRun(c, id, {
      command: "python train.py",
      exitCode: 0,
      startedAt,
      finishedAt,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.run.artifacts.some((a) => a.endsWith("local-plot.png"))).toBe(true);
    expect(r.run.artifacts.some((a) => a.endsWith("metrics.json"))).toBe(true);
  });

  it("appendRun infers off-island results only when mentioned in stdout", () => {
    const c = setup();
    const created = createExperiment(c, { title: "Infer stdout" }, { ensureVenv: false });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const { id } = created;
    const outDir = join(c.projectRoot, "papers", "out");
    mkdirSync(outDir, { recursive: true });
    const startedAt = new Date(Date.now() - 2000).toISOString();
    writeFileSync(join(outDir, "table.csv"), "a,b\n1,2\n");
    writeFileSync(join(outDir, "silent.csv"), "x\n");
    const finishedAt = new Date().toISOString();
    const r = appendRun(c, id, {
      command: "python export.py",
      exitCode: 0,
      startedAt,
      finishedAt,
      stdoutTail: "Wrote papers/out/table.csv",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.run.artifacts.some((a) => a.endsWith("table.csv"))).toBe(true);
    expect(r.run.artifacts.some((a) => a.endsWith("silent.csv"))).toBe(false);
  });

  it("appendRun snapshots image artifacts under the registry", () => {
    const c = setup();
    const created = createExperiment(c, { title: "Snap test" }, { ensureVenv: false });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const { id } = created;
    const manuscriptDir = join(c.projectRoot, "manuscript");
    mkdirSync(manuscriptDir, { recursive: true });
    const pngPath = join(manuscriptDir, "fig.png");
    writeFileSync(pngPath, "png-bytes-v1");
    const r = appendRun(c, id, {
      command: "python plot.py",
      exitCode: 0,
      artifacts: ["manuscript/fig.png"],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.run.artifacts).toEqual(["manuscript/fig.png"]);
    expect(r.run.artifactSnapshots?.length).toBe(1);
    const snapRel = r.run.artifactSnapshots![0]!;
    expect(snapRel).toContain(`.prismnext/experiments/${id}/artifacts/`);
    expect(snapRel.endsWith("fig.png")).toBe(true);
    const snapAbs = join(c.projectRoot, snapRel);
    expect(existsSync(snapAbs)).toBe(true);
    expect(readFileSync(snapAbs, "utf-8")).toBe("png-bytes-v1");
    // Overwrite working copy — snapshot stays frozen
    writeFileSync(pngPath, "png-bytes-v2");
    expect(readFileSync(snapAbs, "utf-8")).toBe("png-bytes-v1");
  });

  it("appendRun writes JSONL under registry only", () => {
    const c = setup();
    const created = createExperiment(c, { title: "Append test" }, { ensureVenv: false });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const { id } = created;
    const r = appendRun(c, id, { command: "python scripts/train.py --lr 0.001", exitCode: 0, stdoutTail: "ok" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.run.cwd).toBe(`experiment/${id}`);

    const raw = readFileSync(join(c.registryRoot, id, "runs.jsonl"), "utf-8");
    expect(raw.trim().split("\n").length).toBe(1);
    expect(existsSync(join(c.projectRoot, "experiment", id, "runs.jsonl"))).toBe(false);
  });

  it("appendRun normalizes island-relative artifacts to project-relative", () => {
    const c = setup();
    const created = createExperiment(c, { title: "Artifact normalize" }, { ensureVenv: false });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const { id } = created;
    const fig = join(c.projectRoot, "experiment", id, "results", "plot.png");
    mkdirSync(dirname(fig), { recursive: true });
    writeFileSync(fig, "fake");
    const r = appendRun(c, id, {
      command: "python plot.py",
      exitCode: 0,
      artifacts: ["results/plot.png"],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.run.artifacts).toEqual([`experiment/${id}/results/plot.png`]);
  });

  it("appendRun keeps artifacts outside the island when that file exists", () => {
    const c = setup();
    const created = createExperiment(c, { title: "Outside artifact" }, { ensureVenv: false });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const { id } = created;
    const fig = join(c.projectRoot, "papers", "out", "fig.png");
    mkdirSync(dirname(fig), { recursive: true });
    writeFileSync(fig, "fake");
    const r = appendRun(c, id, {
      command: "python plot.py",
      exitCode: 0,
      artifacts: ["papers/out/fig.png"],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.run.artifacts).toEqual(["papers/out/fig.png"]);
  });

  it("appendRun resolves bare basenames via project search", () => {
    const c = setup();
    const created = createExperiment(c, { title: "Basename search" }, { ensureVenv: false });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const { id } = created;
    const fig = join(c.projectRoot, "analysis", "plots", "bare.png");
    mkdirSync(dirname(fig), { recursive: true });
    writeFileSync(fig, "fake");
    const r = appendRun(c, id, {
      command: "python plot.py",
      exitCode: 0,
      artifacts: ["bare.png"],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.run.artifacts).toEqual(["analysis/plots/bare.png"]);
  });

  it("bumpRunsStats increments sidecar O(1) without full JSONL recount (Bug #20)", () => {
    const c = setup();
    const created = createExperiment(c, { title: "Stats bump" }, { ensureVenv: false });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const { id } = created;
    // Seed one real line + a deliberately high sidecar — O(1) bump keeps
    // sidecar+1; a full recount would reset to the true line count (2).
    appendRun(c, id, { command: "echo 1", exitCode: 0 });
    const statsPath = join(c.registryRoot, id, "runs.stats.json");
    writeFileSync(
      statsPath,
      JSON.stringify({ runCount: 100, lastRunAt: "2020-01-01T00:00:00.000Z" }),
      "utf-8",
    );
    appendRun(c, id, {
      command: "echo 2",
      exitCode: 0,
      finishedAt: "2026-07-16T12:00:00.000Z",
    });
    const stats = JSON.parse(readFileSync(statsPath, "utf-8")) as {
      runCount: number;
      lastRunAt: string | null;
    };
    expect(stats.runCount).toBe(101);
    expect(stats.lastRunAt).toBe("2026-07-16T12:00:00.000Z");
    const lines = readFileSync(join(c.registryRoot, id, "runs.jsonl"), "utf-8")
      .trim()
      .split("\n");
    expect(lines).toHaveLength(2);
  });

  it("appendRun stamps provenance fields + mirrors into provenance.jsonl", () => {
    const c = setup();
    const created = createExperiment(c, { title: "Provenance test" }, { ensureVenv: false });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const { id } = created;
    const r = appendRun(
      c,
      id,
      {
        command: "python train.py",
        exitCode: 0,
        stdoutTail: "ok",
        artifacts: [`experiment/${id}/results/plot.png`],
      },
      { chatSessionId: "ses_abc" },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Optional fields are stamped onto the run line (persisted in runs.jsonl).
    expect(r.run.chatSessionId).toBe("ses_abc");
    expect(r.run.provenanceEventId).toBeTruthy();

    // Provenance log mirrors run_recorded + one artifact_linked per artifact.
    const events = readProvenanceEvents(c.projectRoot);
    expect(events.filter((e) => e.type === "run_recorded")).toHaveLength(1);
    expect(events.filter((e) => e.type === "artifact_linked")).toHaveLength(1);

    // The artifact resolves back to this run + its chat session.
    const resolved = resolveRunForArtifact(c.projectRoot, `experiment/${id}/results/plot.png`);
    expect(resolved?.run.command).toBe("python train.py");
    expect(resolved?.run.chatSessionId).toBe("ses_abc");
    expect(resolved?.linkMethod).toBe("explicit");
  });

  it("appendRun persists cancelled flag (Bug #21)", () => {
    const c = setup();
    const created = createExperiment(c, { title: "Cancel stamp" }, { ensureVenv: false });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const r = appendRun(c, created.id, {
      command: "python train.py",
      exitCode: 130,
      stdoutTail: "",
      cancelled: true,
      notes: "Cancelled by user",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.run.cancelled).toBe(true);
    const line = JSON.parse(
      readFileSync(join(c.registryRoot, created.id, "runs.jsonl"), "utf-8").trim(),
    ) as { cancelled?: boolean; notes?: string };
    expect(line.cancelled).toBe(true);
    expect(line.notes).toContain("Cancelled by user");
  });

  it("appendRun omits provenanceEventId when provenance mirror fails (Bug #5)", async () => {
    const c = setup();
    const created = createExperiment(c, { title: "Prov fail" }, { ensureVenv: false });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const provenance = await import("../../src/main/services/provenance-service");
    const spy = vi.spyOn(provenance, "recordRunProvenance").mockReturnValue(null);
    try {
      const r = appendRun(c, created.id, {
        command: "python train.py",
        exitCode: 0,
        stdoutTail: "ok",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.run.provenanceEventId).toBeUndefined();
      const line = JSON.parse(
        readFileSync(join(c.registryRoot, created.id, "runs.jsonl"), "utf-8").trim(),
      ) as { provenanceEventId?: string };
      expect(line.provenanceEventId).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
  });

  it("detectEnvForIsland uses workspace island path", () => {
    const c = setup();
    const created = createExperiment(c, { title: "Env test" }, { ensureVenv: false });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const env = detectEnvForIsland(c, created.id, { ensureVenv: false });
    expect(env.ok).toBe(true);
    if (!env.ok) return;
    expect(env.workspacePath).toBe(`experiment/${created.id}`);
    expect(env.env.platform).toBe(process.platform);
  });
});

describe("resolveExperimentDir (workspace integration)", () => {
  let root: string;

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  function writeSettings(projectRoot: string, workspaceDirs: unknown[]): void {
    const prismDir = join(projectRoot, ".prismnext");
    mkdirSync(prismDir, { recursive: true });
    writeFileSync(join(prismDir, "settings.json"), JSON.stringify({ workspaceDirs }), "utf-8");
  }

  it("returns not_configured when no experiment folder is configured", () => {
    root = mkdtempSync(join(tmpdir(), "prism-exp-ws-"));
    writeSettings(root, [{ function: "manuscript", name: "manuscript", mainTex: "main.tex" }]);
    const result = resolveExperimentDir(root, join(root, ".prismnext"));
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toBe("not_configured");
  });

  it("resolves a custom experiment folder name", () => {
    root = mkdtempSync(join(tmpdir(), "prism-exp-ws-"));
    writeSettings(root, [
      { function: "manuscript", name: "manuscript", mainTex: "main.tex" },
      { function: "experiment", name: "analysis" },
    ]);
    const result = resolveExperimentDir(root, join(root, ".prismnext"));
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.rel).toBe("analysis");
    expect(result.abs).toBe(join(root, "analysis"));
  });
});

describe("experimentEnvDisplayRows", () => {
  it("always includes python, platform, and venv rows", () => {
    const rows = experimentEnvDisplayRows({
      python: null,
      pythonVersion: null,
      rscript: null,
      rVersion: null,
      platform: "darwin",
      gitCommit: null,
      venvPath: null,
    });
    expect(rows.map((r) => r.label)).toEqual(["Python", "Platform", "Venv"]);
  });

  it("adds R and Git only when detected", () => {
    const rows = experimentEnvDisplayRows({
      python: "/usr/bin/python3",
      pythonVersion: "3.13.0",
      rscript: "/usr/local/bin/Rscript",
      rVersion: "4.4.0",
      platform: "darwin",
      gitCommit: "abc1234",
      venvPath: ".prismnext/.venv",
    });
    expect(rows.map((r) => r.label)).toEqual([
      "Python",
      "Platform",
      "Venv",
      "R",
      "Git",
    ]);
  });
});

describe("tailBytes", () => {
  it("truncates using TextEncoder when Buffer is unavailable", async () => {
    const originalBuffer = globalThis.Buffer;
    // @ts-expect-error test shim
    delete globalThis.Buffer;
    const { tailBytes: tailBytesFresh } = await import("../../src/shared/experiment-log");
    const long = "a".repeat(5000);
    const out = tailBytesFresh(long, 100);
    expect(new TextEncoder().encode(out).length).toBeLessThanOrEqual(100);
    globalThis.Buffer = originalBuffer;
  });
});
