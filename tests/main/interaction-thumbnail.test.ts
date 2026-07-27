import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveFigureForThumbnail } from "../../src/main/services/interaction-thumbnail";
import { PLOTLY_SAMPLE_FIGURE } from "../../src/shared/interaction-plotly";
import { INSTRUMENT_SAMPLE_MODEL } from "../../src/shared/interaction-instrument";
import type { InteractionSpec } from "../../src/shared/interaction-spec";

function baseSpec(overrides: Partial<InteractionSpec>): InteractionSpec {
  return {
    id: "demo.thumb",
    title: "Demo",
    kind: "figure.plotly",
    compute: "local",
    revision: 1,
    ...overrides,
  };
}

describe("resolveFigureForThumbnail", () => {
  it("resolves an inline figure.plotly model", () => {
    const spec = baseSpec({ model: { figure: PLOTLY_SAMPLE_FIGURE } });
    const result = resolveFigureForThumbnail("/tmp/does-not-matter", spec);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.figure.data.length).toBeGreaterThan(0);
    }
  });

  it("reads, parses, and validates a file-mode figure.plotly resource", () => {
    const root = mkdtempSync(join(tmpdir(), "ix-thumb-"));
    const dir = join(root, ".prismnext", "artifacts", "demo.thumb");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "figure.json"), JSON.stringify(PLOTLY_SAMPLE_FIGURE), "utf8");

    const spec = baseSpec({
      resources: [{ role: "figure-json", path: "figure.json" }],
    });
    const result = resolveFigureForThumbnail(root, spec);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.figure.data[0]?.type).toBe("surface");
    }

    rmSync(root, { recursive: true, force: true });
  });

  it("fails closed on invalid JSON in a file-mode resource (does not throw)", () => {
    const root = mkdtempSync(join(tmpdir(), "ix-thumb-"));
    const dir = join(root, ".prismnext", "artifacts", "demo.thumb");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "figure.json"), "{ not valid json", "utf8");

    const spec = baseSpec({
      resources: [{ role: "figure-json", path: "figure.json" }],
    });
    let result: ReturnType<typeof resolveFigureForThumbnail> | undefined;
    expect(() => {
      result = resolveFigureForThumbnail(root, spec);
    }).not.toThrow();
    expect(result?.ok).toBe(false);

    rmSync(root, { recursive: true, force: true });
  });

  it("fails when a file-mode resource is missing", () => {
    const root = mkdtempSync(join(tmpdir(), "ix-thumb-"));
    const spec = baseSpec({
      resources: [{ role: "figure-json", path: "nope.json" }],
    });
    const result = resolveFigureForThumbnail(root, spec);
    expect(result.ok).toBe(false);

    rmSync(root, { recursive: true, force: true });
  });

  it("resolves an instrument model at step 0 with default bindings", () => {
    const spec = baseSpec({
      kind: "instrument",
      model: INSTRUMENT_SAMPLE_MODEL as unknown as Record<string, unknown>,
      bindings: { R: { min: 0, max: 2, step: 0.1, default: 1, label: "R" } },
    });
    const result = resolveFigureForThumbnail("/tmp/does-not-matter", spec);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.figure.data[0]?.type).toBe("surface");
    }
  });

  it("fails closed for an instrument model with a broken expression", () => {
    const spec = baseSpec({
      kind: "instrument",
      model: {
        runtimeVersion: 1,
        figureTemplate: {
          data: [{ type: "surface", z: { $exprGrid: "eval('x')" } }],
        },
      },
    });
    const result = resolveFigureForThumbnail("/tmp/does-not-matter", spec);
    expect(result.ok).toBe(false);
  });

  it("fails closed for an unsupported kind", () => {
    const spec = baseSpec({ kind: "figure.static", resources: [{ role: "figure", path: "a.png" }] });
    const result = resolveFigureForThumbnail("/tmp/does-not-matter", spec);
    expect(result.ok).toBe(false);
  });
});
