import { describe, expect, it } from "vitest";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  clearInteractionLastError,
  interactionThumbnailPath,
  listInteractionSummaries,
  readInteractionLastError,
  readInteractionSpec,
  upsertInteractionSpec,
  writeInteractionLastError,
  writeInteractionThumbnail,
} from "../../src/main/services/interaction-store";
import { INSTRUMENT_SAMPLE_MODEL } from "../../src/shared/interaction-instrument";
import { SCRIPT_SAMPLE_JS } from "../../src/shared/interaction-script";
import { DIAGRAM_SAMPLE_DOT_SPEC } from "../../src/shared/interaction-diagram";

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
      model: {
        domain: { uMin: -2, uMax: 2, vMin: -2, vMax: 2, resolution: 6 },
        figure: {
          data: [
            {
              type: "surface",
              x: { $grid: "u" },
              y: { $grid: "v" },
              z: { $exprGrid: "u*u - v*v" },
            },
          ],
        },
      },
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
    expect(bound.spec?.resources?.[0]?.fingerprint).toMatchObject({
      algorithm: "sha256",
      bytes: expect.any(Number),
      digest: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    writeFileSync(
      join(root, "experiment", "exp-1", "results", "field.json"),
      JSON.stringify({ data: [{ type: "surface" }] }),
      "utf8",
    );
    expect(readInteractionSpec(root, "demo.field")).toEqual(
      expect.objectContaining({
        spec: null,
        error: expect.stringMatching(/resource changed/),
      }),
    );
    const rewritten = upsertInteractionSpec(root, {
      id: "demo.field",
      title: "Field",
      kind: "figure.plotly",
      compute: "bound",
      revision: 1,
      resources: [{ role: "figure-json", path: "experiment/exp-1/results/field.json" }],
    });
    expect(rewritten.spec?.revision).toBe(2);
    expect(readInteractionSpec(root, "demo.field").spec).toEqual(
      expect.objectContaining({ revision: 2 }),
    );

    rmSync(root, { recursive: true, force: true });
  });

  it("rejects a hand-typed literal grid array on an inline figure.plotly surface", () => {
    root = mkdtempSync(join(tmpdir(), "ix-plotly-gate-"));
    const result = upsertInteractionSpec(root, {
      id: "demo.sphere.bad",
      title: "Bad sphere",
      kind: "figure.plotly",
      compute: "local",
      revision: 1,
      model: {
        figure: {
          data: [
            {
              type: "surface",
              x: [-1, 0, 1],
              y: [-1, 0, 1],
              z: [
                [1, 0, 1],
                [0, -1, 0],
                [1, 0, 1],
              ],
            },
          ],
        },
      },
    });
    expect(result.ok).toBe(false);
    expect(String(result.error)).toMatch(/literal array/);

    rmSync(root, { recursive: true, force: true });
  });

  it("bakes resolved marker figures into literal numbers persisted on disk", () => {
    root = mkdtempSync(join(tmpdir(), "ix-plotly-bake-"));
    const result = upsertInteractionSpec(root, {
      id: "demo.sphere.ok",
      title: "Unit sphere",
      kind: "figure.plotly",
      compute: "local",
      revision: 1,
      model: {
        domain: { uMin: 0, uMax: Math.PI, vMin: 0, vMax: 2 * Math.PI, resolution: 4 },
        figure: {
          data: [
            {
              type: "surface",
              x: { $exprGrid: "sin(u) * cos(v)" },
              y: { $exprGrid: "sin(u) * sin(v)" },
              z: { $exprGrid: "cos(u)" },
            },
          ],
        },
      },
    });
    expect(result.ok).toBe(true);
    const specPath = join(root, ".prismnext", "artifacts", "demo.sphere.ok", "spec.json");
    const persisted = JSON.parse(readFileSync(specPath, "utf8")) as {
      model: { figure: { data: { x: unknown; type: string }[] } };
    };
    const trace = persisted.model.figure.data[0]!;
    expect(trace.type).toBe("surface");
    expect(Array.isArray(trace.x)).toBe(true);
    expect(Array.isArray((trace.x as unknown[])[0])).toBe(true);
    const x00 = (trace.x as number[][])[0]![0]!;
    expect(x00).toBeCloseTo(0, 5); // sin(0) * cos(0) = 0

    rmSync(root, { recursive: true, force: true });
  });

  it("rejects malformed model.domain / model.params on inline figure.plotly", () => {
    root = mkdtempSync(join(tmpdir(), "ix-plotly-domain-"));
    const badDomain = upsertInteractionSpec(root, {
      id: "demo.baddomain",
      title: "Bad domain",
      kind: "figure.plotly",
      compute: "local",
      revision: 1,
      model: { domain: "nope", figure: { data: [{ type: "scatter", mode: "markers", x: { $expr: "1" } }] } },
    });
    expect(badDomain.ok).toBe(false);
    expect(String(badDomain.error)).toMatch(/domain/);

    const badParams = upsertInteractionSpec(root, {
      id: "demo.badparams",
      title: "Bad params",
      kind: "figure.plotly",
      compute: "local",
      revision: 1,
      model: {
        params: { R: "not-a-number" },
        figure: { data: [{ type: "scatter", mode: "markers", x: { $expr: "R" } }] },
      },
    });
    expect(badParams.ok).toBe(false);
    expect(String(badParams.error)).toMatch(/params/);

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
    const legacyDomain = upsertInteractionSpec(root, {
      id: "demo.instrument.legacy-domain",
      title: "Legacy domain",
      kind: "instrument",
      compute: "local",
      revision: 1,
      model: {
        runtimeVersion: 1,
        domain: { uMin: -1, uMax: 1, vMin: -1, vMax: 1, resolution: 4 },
        figureTemplate: {
          data: [
            {
              type: "surface",
              x: { $grid: "u" },
              y: { $grid: "v" },
              z: { $exprGrid: "u * v * scale" },
            },
          ],
        },
      },
      bindings: { scale: { min: 0.5, max: 2, default: 1, label: "scale" } },
    });
    expect(legacyDomain.ok).toBe(true);
    expect((legacyDomain.spec?.model?.domain as { axes?: unknown[] } | undefined)?.axes).toHaveLength(2);

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

  it("accepts a figure.script with a valid script resource, rejects a missing/banned one", () => {
    root = mkdtempSync(join(tmpdir(), "ix-script-"));
    const dir = join(root, ".prismnext", "artifacts", "demo.script");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "script.js"), SCRIPT_SAMPLE_JS, "utf8");

    const ok = upsertInteractionSpec(root, {
      id: "demo.script",
      title: "Custom scatter",
      kind: "figure.script",
      compute: "local",
      revision: 1,
      resources: [{ role: "script", path: "script.js" }],
    });
    expect(ok.ok).toBe(true);

    const missing = upsertInteractionSpec(root, {
      id: "demo.script.missing",
      title: "Missing script",
      kind: "figure.script",
      compute: "local",
      revision: 1,
      resources: [{ role: "script", path: "nope.js" }],
    });
    expect(missing.ok).toBe(false);

    const bannedDir = join(root, ".prismnext", "artifacts", "demo.script.banned");
    mkdirSync(bannedDir, { recursive: true });
    writeFileSync(
      join(bannedDir, "script.js"),
      "export function render(ctx) { fetch('https://x.com'); }",
      "utf8",
    );
    const banned = upsertInteractionSpec(root, {
      id: "demo.script.banned",
      title: "Banned script",
      kind: "figure.script",
      compute: "local",
      revision: 1,
      resources: [{ role: "script", path: "script.js" }],
    });
    expect(banned.ok).toBe(false);
    expect(String(banned.error)).toMatch(/fetch/i);

    rmSync(root, { recursive: true, force: true });
  });

  it("accepts a diagram.mermaid with inline/file sources, rejects bad engine/missing file", () => {
    root = mkdtempSync(join(tmpdir(), "ix-diagram-"));

    const inline = upsertInteractionSpec(root, {
      id: "demo.diagram.inline",
      title: "Retry flow",
      kind: "diagram.mermaid",
      compute: "local",
      revision: 1,
      model: { source: "graph TD; A-->B;" },
    });
    expect(inline.ok).toBe(true);

    const dot = upsertInteractionSpec(root, DIAGRAM_SAMPLE_DOT_SPEC as Parameters<typeof upsertInteractionSpec>[1]);
    expect(dot.ok).toBe(true);

    const dir = join(root, ".prismnext", "artifacts", "demo.diagram.file");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "flow.dot"), "digraph { a -> b; }", "utf8");
    const fileOk = upsertInteractionSpec(root, {
      id: "demo.diagram.file",
      title: "Call graph",
      kind: "diagram.mermaid",
      compute: "local",
      revision: 1,
      model: { engine: "dot" },
      resources: [{ role: "diagram-source", path: "flow.dot" }],
    });
    expect(fileOk.ok).toBe(true);

    const badEngine = upsertInteractionSpec(root, {
      id: "demo.diagram.badengine",
      title: "Bad engine",
      kind: "diagram.mermaid",
      compute: "local",
      revision: 1,
      model: { engine: "neato", source: "digraph { a -> b; }" },
    });
    expect(badEngine.ok).toBe(false);

    const missingFile = upsertInteractionSpec(root, {
      id: "demo.diagram.missing",
      title: "Missing file",
      kind: "diagram.mermaid",
      compute: "local",
      revision: 1,
      resources: [{ role: "diagram-source", path: "nope.dot" }],
    });
    expect(missingFile.ok).toBe(false);

    rmSync(root, { recursive: true, force: true });
  });

  it("rejects retired legacy kinds (scene.ir, scene.program, math.surface, math.field)", () => {
    root = mkdtempSync(join(tmpdir(), "ix-store-"));
    for (const kind of ["scene.ir", "scene.program", "math.surface", "math.field"]) {
      const result = upsertInteractionSpec(root, {
        id: `demo.${kind.replace(".", "-")}`,
        title: "Legacy",
        kind,
        compute: "local",
        revision: 1,
      });
      expect(result.ok, `expected ${kind} to be rejected`).toBe(false);
    }

    rmSync(root, { recursive: true, force: true });
  });

  it("persists and clears last-error independent of any prior spec write", () => {
    root = mkdtempSync(join(tmpdir(), "ix-store-"));
    expect(
      writeInteractionLastError(root, "err.demo", { message: "boom", phase: "mount" }).ok,
    ).toBe(true);
    expect(readInteractionLastError(root, "err.demo")?.message).toBe("boom");
    expect(clearInteractionLastError(root, "err.demo").ok).toBe(true);
    expect(readInteractionLastError(root, "err.demo")).toBeNull();

    rmSync(root, { recursive: true, force: true });
  });

  it("persists and round-trips a last-error with phase thumbnail", () => {
    root = mkdtempSync(join(tmpdir(), "ix-store-"));
    expect(
      writeInteractionLastError(root, "err.thumb", {
        message: "capture failed",
        phase: "thumbnail",
      }).ok,
    ).toBe(true);
    const err = readInteractionLastError(root, "err.thumb");
    expect(err?.message).toBe("capture failed");
    expect(err?.phase).toBe("thumbnail");

    rmSync(root, { recursive: true, force: true });
  });

  it("writes a thumbnail PNG atomically and reads it back byte-for-byte", () => {
    root = mkdtempSync(join(tmpdir(), "ix-store-"));
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const result = writeInteractionThumbnail(root, "demo.thumb", png);
    expect(result.ok).toBe(true);

    const abs = interactionThumbnailPath(root, "demo.thumb");
    expect(existsSync(abs)).toBe(true);
    expect(readFileSync(abs)).toEqual(png);

    // No leftover tmp file.
    const dir = join(root, ".prismnext", "artifacts", "demo.thumb");
    const leftovers = readdirSync(dir).filter((f) => f.includes(".tmp"));
    expect(leftovers).toHaveLength(0);

    rmSync(root, { recursive: true, force: true });
  });

  it("rejects writing a thumbnail for an invalid id", () => {
    root = mkdtempSync(join(tmpdir(), "ix-store-"));
    const result = writeInteractionThumbnail(root, "../evil", Buffer.from("x"));
    expect(result.ok).toBe(false);

    rmSync(root, { recursive: true, force: true });
  });
});
