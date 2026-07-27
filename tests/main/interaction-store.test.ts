import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  clearInteractionLastError,
  listInteractionSummaries,
  readInteractionLastError,
  upsertInteractionSpec,
  writeInteractionLastError,
  writeInteractionSceneSource,
} from "../../src/main/services/interaction-store";
import { SCENE_PROGRAM_SAMPLE } from "../../src/shared/interaction-scene-contract";
import { INSTRUMENT_SAMPLE_MODEL } from "../../src/shared/interaction-instrument";

describe("interaction-store upsert", () => {
  let root: string;

  it("creates and bumps revision on update", () => {
    root = mkdtempSync(join(tmpdir(), "ix-store-"));
    const created = upsertInteractionSpec(root, {
      id: "demo.plot",
      title: "Demo",
      kind: "plot.line",
      compute: "local",
      revision: 1,
    });
    expect(created.ok).toBe(true);
    expect(created.created).toBe(true);
    expect(created.spec?.revision).toBe(1);

    const updated = upsertInteractionSpec(root, {
      id: "demo.plot",
      title: "Demo v2",
      kind: "plot.line",
      compute: "local",
      revision: 1,
    });
    expect(updated.ok).toBe(true);
    expect(updated.created).toBe(false);
    expect(updated.spec?.revision).toBe(2);
    expect(updated.spec?.title).toBe("Demo v2");

    const listed = listInteractionSummaries(root);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.revision).toBe(2);

    rmSync(root, { recursive: true, force: true });
  });

  it("rejects unsupported kind on upsert", () => {
    root = mkdtempSync(join(tmpdir(), "ix-store-"));
    const upsert = upsertInteractionSpec(root, {
      id: "bad2",
      title: "Bad2",
      kind: "custom.widget",
      compute: "local",
      revision: 1,
    });
    expect(upsert.ok).toBe(false);

    rmSync(root, { recursive: true, force: true });
  });

  it("accepts figure.static when resource file exists", () => {
    root = mkdtempSync(join(tmpdir(), "ix-store-"));
    const artifactDir = join(root, ".prismnext", "artifacts", "demo.fig");
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(join(artifactDir, "out.png"), "fake-png", "utf8");

    const fig = upsertInteractionSpec(root, {
      id: "demo.fig",
      title: "Fig",
      kind: "figure.static",
      compute: "local",
      revision: 1,
      resources: [{ role: "figure", path: "out.png" }],
    });
    expect(fig.ok).toBe(true);

    const missing = upsertInteractionSpec(root, {
      id: "demo.fig2",
      title: "Fig2",
      kind: "figure.static",
      compute: "local",
      revision: 1,
    });
    expect(missing.ok).toBe(false);
    expect(String(missing.error)).toMatch(/resources/i);

    rmSync(root, { recursive: true, force: true });
  });

  it("accepts bound figure.static pointing at a real experiment results path (no re-render needed)", () => {
    root = mkdtempSync(join(tmpdir(), "ix-store-"));
    const resultsDir = join(root, "experiment", "exp-loss", "results");
    mkdirSync(resultsDir, { recursive: true });
    writeFileSync(join(resultsDir, "loss.png"), "fake-png", "utf8");

    const bound = upsertInteractionSpec(root, {
      id: "demo.exp-loss",
      title: "Training loss (bound)",
      kind: "figure.static",
      compute: "bound",
      revision: 1,
      resources: [{ role: "figure", path: "experiment/exp-loss/results/loss.png" }],
    });
    expect(bound.ok).toBe(true);
    // Real experiment output stays at its own path — not copied under
    // .prismnext/artifacts/<id>/ like agent-generated local figures.
    expect(existsSync(join(resultsDir, "loss.png"))).toBe(true);

    const missingRun = upsertInteractionSpec(root, {
      id: "demo.exp-missing",
      title: "Missing run",
      kind: "figure.static",
      compute: "bound",
      revision: 1,
      resources: [{ role: "figure", path: "experiment/does-not-exist/results/loss.png" }],
    });
    expect(missingRun.ok).toBe(false);
    expect(String(missingRun.error)).toMatch(/not found/i);

    rmSync(root, { recursive: true, force: true });
  });

  it("accepts inline figure.plotly and rejects missing json resource", () => {
    root = mkdtempSync(join(tmpdir(), "ix-plotly-"));
    const inline = upsertInteractionSpec(root, {
      id: "demo.saddle",
      title: "Saddle",
      kind: "figure.plotly",
      compute: "local",
      revision: 1,
      model: { figure: { data: [{ type: "surface", z: [[0, 1]] }] } },
    });
    expect(inline.ok).toBe(true);

    const missing = upsertInteractionSpec(root, {
      id: "demo.field",
      title: "Field",
      kind: "figure.plotly",
      compute: "bound",
      revision: 1,
      resources: [{ role: "figure-json", path: "experiment/exp-1/results/field.json" }],
    });
    expect(missing.ok).toBe(false);
    expect(missing.error).toMatch(/not found on disk/);

    mkdirSync(join(root, "experiment", "exp-1", "results"), { recursive: true });
    writeFileSync(
      join(root, "experiment", "exp-1", "results", "field.json"),
      JSON.stringify({ data: [{ type: "cone" }] }),
      "utf8",
    );
    const bound = upsertInteractionSpec(root, {
      id: "demo.field",
      title: "Field",
      kind: "figure.plotly",
      compute: "bound",
      revision: 1,
      resources: [{ role: "figure-json", path: "experiment/exp-1/results/field.json" }],
    });
    expect(bound.ok).toBe(true);

    rmSync(root, { recursive: true, force: true });
  });

  it("accepts a well-formed instrument, rejects bound compute and bad expressions", () => {
    root = mkdtempSync(join(tmpdir(), "ix-instrument-"));
    const ok = upsertInteractionSpec(root, {
      id: "demo.instrument",
      title: "Saddle instrument",
      kind: "instrument",
      compute: "local",
      revision: 1,
      model: INSTRUMENT_SAMPLE_MODEL as unknown as Record<string, unknown>,
      bindings: { R: { min: 0.2, max: 3, default: 1, label: "R" } },
    });
    expect(ok.ok).toBe(true);

    const bound = upsertInteractionSpec(root, {
      id: "demo.instrument.bound",
      title: "Bound instrument",
      kind: "instrument",
      compute: "bound",
      revision: 1,
      model: INSTRUMENT_SAMPLE_MODEL as unknown as Record<string, unknown>,
    });
    expect(bound.ok).toBe(false);

    const badExpr = upsertInteractionSpec(root, {
      id: "demo.instrument.bad",
      title: "Bad instrument",
      kind: "instrument",
      compute: "local",
      revision: 1,
      model: {
        runtimeVersion: 1,
        figureTemplate: { data: [{ type: "scatter", x: [{ $expr: "eval('1')" }] }] },
      },
    });
    expect(badExpr.ok).toBe(false);

    rmSync(root, { recursive: true, force: true });
  });

  it("accepts scene.program builtin", () => {
    root = mkdtempSync(join(tmpdir(), "ix-store-"));
    const scene = upsertInteractionSpec(root, {
      id: "demo.lorenz",
      title: "Lorenz",
      kind: "scene.program",
      compute: "local",
      revision: 1,
      entry: "builtin:lorenz",
    });
    expect(scene.ok).toBe(true);
    expect(scene.spec?.entry).toBe("builtin:lorenz");

    rmSync(root, { recursive: true, force: true });
  });

  it("writes scene.js next to the artifact; strips three imports via soft-compat", () => {
    root = mkdtempSync(join(tmpdir(), "ix-store-"));
    const ok = writeInteractionSceneSource(root, "cube.demo", SCENE_PROGRAM_SAMPLE);
    expect(ok.ok).toBe(true);
    expect(ok.relativePath).toBe(".prismnext/artifacts/cube.demo/scene.js");
    const abs = join(root, ".prismnext", "artifacts", "cube.demo", "scene.js");
    expect(existsSync(abs)).toBe(true);
    expect(readFileSync(abs, "utf8")).toContain("ctx.three.ensure");

    const soft = writeInteractionSceneSource(
      root,
      "cube.soft",
      `import * as THREE from "three";\nexport function mount(ctx) { void THREE; void ctx; }`,
    );
    expect(soft.ok).toBe(true);

    const bad = writeInteractionSceneSource(
      root,
      "cube.bad",
      `import foo from "not-three";\nexport function mount() {}`,
    );
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/cannot use import/);
    expect(bad.error).not.toMatch(/lorenz/i);

    rmSync(root, { recursive: true, force: true });
  });

  it("persists and clears scene last-error", () => {
    root = mkdtempSync(join(tmpdir(), "ix-store-"));
    upsertInteractionSpec(root, {
      id: "err.demo",
      title: "Err",
      kind: "scene.program",
      compute: "local",
      revision: 1,
      entry: "builtin:lorenz",
    });
    expect(
      writeInteractionLastError(root, "err.demo", { message: "boom", phase: "mount" }).ok,
    ).toBe(true);
    expect(readInteractionLastError(root, "err.demo")?.message).toBe("boom");
    expect(clearInteractionLastError(root, "err.demo").ok).toBe(true);
    expect(readInteractionLastError(root, "err.demo")).toBeNull();

    rmSync(root, { recursive: true, force: true });
  });
});
