import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendRun,
  buildExperimentStorageContext,
  createExperiment,
  detectEnvForIsland,
  generateExperimentSlug,
  listExperiments,
  readExperiment,
} from "../../src/main/services/experiment-log-service";
import { resolveExperimentDir } from "../../src/main/services/workspace-config";
import {
  EXPERIMENT_REGISTRY_REL,
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
    const result = createExperiment(c, {
      title: "LR ablation",
      briefLinks: { sections: ["Hypotheses / claims"], hypothesisExcerpt: "H1: lr=1e-3 wins" },
      tags: ["ablation"],
    });
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
    const result = createExperiment(c, { title: "   " });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("missing_title");
  });

  it("listExperiments returns created experiments from registry", () => {
    const c = setup();
    const a = createExperiment(c, { title: "A" });
    const b = createExperiment(c, { title: "B" });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    const list = listExperiments(c);
    expect(list.experiments.map((e) => e.id).sort()).toEqual([a.id, b.id].sort());
    expect(list.experiments[0]!.workspacePath).toMatch(/^experiment\//);
    expect(list.registryRoot).toBe(EXPERIMENT_REGISTRY_REL);
  });

  it("readExperiment returns meta + runs (tail-limited)", () => {
    const c = setup();
    const created = createExperiment(c, { title: "Read test" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const { id } = created;
    for (let i = 0; i < 25; i++) {
      appendRun(c, id, { command: `echo ${i}`, exitCode: 0, stdoutTail: `out${i}` });
    }
    const read = readExperiment(c, id, 5);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.runs.length).toBe(5);
    expect(read.runs[4]!.stdoutTail).toBe("out24");
    expect(read.meta.title).toBe("Read test");
  });

  it("readExperiment returns experiment_not_found for unknown id", () => {
    const c = setup();
    const read = readExperiment(c, "exp-does-not-exist", 20);
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.error).toBe("experiment_not_found");
  });

  it("appendRun writes JSONL under registry only", () => {
    const c = setup();
    const created = createExperiment(c, { title: "Append test" });
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

  it("detectEnvForIsland uses workspace island path", () => {
    const c = setup();
    const created = createExperiment(c, { title: "Env test" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const env = detectEnvForIsland(c, created.id);
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
