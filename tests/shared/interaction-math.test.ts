import { describe, expect, it } from "vitest";
import {
  buildMathScene,
  buildSurfaceMesh,
  evaluateMathExpression,
  initialBindingValues,
  isMathExpressionAllowed,
  parseMathBindings,
  resolveSurfaceExpression,
} from "../../src/shared/interaction-math";
import type { InteractionSpec } from "../../src/shared/interaction-spec";

describe("interaction-math", () => {
  it("allows safe expressions and rejects unsafe ones", () => {
    expect(isMathExpressionAllowed("Math.sin(u) * Math.cos(v)", ["a"])).toBe(true);
    expect(isMathExpressionAllowed("a * u + v", ["a"])).toBe(true);
    expect(isMathExpressionAllowed("eval('1')", [])).toBe(false);
    expect(isMathExpressionAllowed("process.exit()", [])).toBe(false);
  });

  it("evaluates explicit surface expression", () => {
    const z = evaluateMathExpression("Math.sin(u) * Math.cos(v)", { u: 0, v: 0 });
    expect(z).toBeCloseTo(0, 5);
  });

  it("builds surface mesh with finite positions", () => {
    const mesh = buildSurfaceMesh(
      { uMin: -1, uMax: 1, vMin: -1, vMax: 1, resolution: 8 },
      "u*u + v*v",
      {},
    );
    expect(mesh.positions.length).toBe(8 * 8 * 3);
    expect(mesh.indices.length).toBeGreaterThan(0);
    expect([...mesh.positions].every(Number.isFinite)).toBe(true);
  });

  it("parseMathBindings reads defaults", () => {
    const b = parseMathBindings({
      a: { min: -1, max: 1, default: 0.2, label: "curvature" },
    });
    expect(b.a?.default).toBe(0.2);
    expect(initialBindingValues(b)).toEqual({ a: 0.2 });
  });

  it("buildMathScene for default surface spec", () => {
    const spec: InteractionSpec = {
      id: "landscape",
      title: "Loss landscape",
      kind: "math.surface",
      compute: "local",
      revision: 1,
      model: { type: "explicit", z: "Math.sin(u) * Math.cos(v) + a * u" },
      bindings: { a: { min: -1, max: 1, default: 0.2 } },
    };
    const scene = buildMathScene(spec, { a: 0.2 });
    expect(scene.ok).toBe(true);
    if (scene.ok) expect(scene.kind).toBe("math.surface");
  });

  it("resolveSurfaceExpression falls back to default", () => {
    const spec: InteractionSpec = {
      id: "x",
      title: "x",
      kind: "math.surface",
      compute: "local",
      revision: 1,
    };
    expect(resolveSurfaceExpression(spec)).toContain("Math.sin");
  });

  it("rejects bound math in P2 local-only path", () => {
    const spec: InteractionSpec = {
      id: "x",
      title: "x",
      kind: "math.field",
      compute: "bound",
      revision: 1,
    };
    const scene = buildMathScene(spec, {});
    expect(scene.ok).toBe(false);
    if (!scene.ok) expect(scene.error).toContain("bound");
  });
});
