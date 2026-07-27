import { describe, expect, it } from "vitest";
import {
  evaluateMathExpression,
  initialBindingValues,
  isMathExpressionAllowed,
  parseMathBindings,
} from "../../src/shared/interaction-math";

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

  it("evaluates bare trig function names (no Math. prefix)", () => {
    // Regression: isMathExpressionAllowed permits bare `cos`/`sin`/etc (they
    // are in ALLOWED_MATH_IDENTIFIERS) so the evaluator must bind them too,
    // otherwise agents writing natural sphere/torus formulas like
    // `cos(u)*sin(v)` hit a runtime `ReferenceError: cos is not defined`.
    const x = evaluateMathExpression("cos(u) * sin(v)", { u: 0, v: Math.PI / 2 });
    expect(x).toBeCloseTo(1, 5);
    const y = evaluateMathExpression("sqrt(u*u + v*v)", { u: 3, v: 4 });
    expect(y).toBeCloseTo(5, 5);
    const z = evaluateMathExpression("PI * u", { u: 2 });
    expect(z).toBeCloseTo(Math.PI * 2, 5);
  });

  it("lets a binding named like a math local shadow it", () => {
    const v = evaluateMathExpression("E * 2", { E: 10, u: 0, v: 0 });
    expect(v).toBe(20);
  });

  it("supports differential-geometry helpers (atan2, log, sinh, hypot)", () => {
    expect(evaluateMathExpression("atan2(v, u)", { u: 1, v: 1 })).toBeCloseTo(Math.PI / 4, 5);
    expect(evaluateMathExpression("log(u)", { u: Math.E })).toBeCloseTo(1, 5);
    expect(evaluateMathExpression("sinh(u)", { u: 0 })).toBeCloseTo(0, 5);
    expect(evaluateMathExpression("hypot(u, v)", { u: 3, v: 4 })).toBeCloseTo(5, 5);
  });

  it("parseMathBindings reads defaults", () => {
    const b = parseMathBindings({
      a: { min: -1, max: 1, default: 0.2, label: "curvature" },
    });
    expect(b.a?.default).toBe(0.2);
    expect(initialBindingValues(b)).toEqual({ a: 0.2 });
  });
});
