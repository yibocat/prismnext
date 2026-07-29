import { describe, expect, it } from "vitest";
import {
  buildDomainGrids,
  checkNoLiteralGridArrays,
  parseComputeDomain,
  resolveBaseMarker,
  walkResolveMarkers,
} from "../../src/shared/interaction-compute";

describe("parseComputeDomain", () => {
  it("returns undefined when absent, null when malformed", () => {
    expect(parseComputeDomain(undefined)).toBeUndefined();
    expect(parseComputeDomain("nope")).toBeNull();
    expect(parseComputeDomain([1, 2])).toBeNull();
  });

  it("fills defaults and clamps resolution", () => {
    const d = parseComputeDomain({ resolution: 999 });
    expect(d).toMatchObject({
      uMin: -2,
      uMax: 2,
      vMin: -2,
      vMax: 2,
      resolution: 128,
      axes: [
        { name: "u", min: -2, max: 2, resolution: 128 },
        { name: "v", min: -2, max: 2, resolution: 128 },
      ],
    });
  });

  it("accepts explicitly named axes instead of assuming u/v", () => {
    const domain = parseComputeDomain({
      axes: [
        { name: "theta", min: 0, max: Math.PI, resolution: 3 },
        { name: "phi", min: 0, max: 2 * Math.PI, resolution: 5 },
      ],
    });
    expect(domain?.axes).toEqual([
      { name: "theta", min: 0, max: Math.PI, resolution: 4 },
      { name: "phi", min: 0, max: 2 * Math.PI, resolution: 5 },
    ]);
    expect(buildDomainGrids(domain!).theta).toEqual([0, Math.PI / 3, (2 * Math.PI) / 3, Math.PI]);
  });
});

describe("buildDomainGrids", () => {
  it("builds evenly spaced axes", () => {
    const grids = buildDomainGrids({ uMin: 0, uMax: 4, vMin: 0, vMax: 1, resolution: 5 });
    expect(grids.u).toEqual([0, 1, 2, 3, 4]);
    expect(grids.v.length).toBe(5);
  });
});

describe("resolveBaseMarker", () => {
  const domainGrids = buildDomainGrids({ uMin: 0, uMax: Math.PI, vMin: 0, vMax: 1, resolution: 3 });

  it("$grid returns the raw axis", () => {
    expect(resolveBaseMarker("$grid", "u", { domainGrids, varContext: {} })).toEqual(domainGrids.u);
    expect(() => resolveBaseMarker("$grid", "u", { domainGrids: null, varContext: {} })).toThrow();
  });

  it("$exprGrid evaluates a 2D grid over u,v", () => {
    const grid = resolveBaseMarker("$exprGrid", "sin(u)", {
      domainGrids,
      varContext: {},
    }) as number[][];
    expect(grid.length).toBe(3);
    expect(grid[0]!.length).toBe(3);
    expect(grid[0]![0]).toBeCloseTo(Math.sin(0));
  });

  it("$exprSeries evaluates a 1D series over one axis", () => {
    const series = resolveBaseMarker("$exprSeries", { over: "u", expr: "u*u" }, {
      domainGrids,
      varContext: {},
    }) as number[];
    expect(series).toHaveLength(3);
    expect(series[2]).toBeCloseTo(domainGrids.u[2]! ** 2);
  });

  it("$exprSeries rejects a missing/invalid over axis", () => {
    expect(() =>
      resolveBaseMarker("$exprSeries", { over: "w", expr: "u" }, { domainGrids, varContext: {} }),
    ).toThrow(/over/);
  });

  it("$exprSeries.resolution overrides the point count using domain bounds (for coarse->fine frames)", () => {
    const domain = { uMin: -2, uMax: 2, vMin: 0, vMax: 1, resolution: 40 };
    const coarse = resolveBaseMarker(
      "$exprSeries",
      { over: "u", expr: "u*u", resolution: 3 },
      { domain, domainGrids: buildDomainGrids(domain), varContext: {} },
    ) as number[];
    expect(coarse).toEqual([4, 0, 4]);

    expect(() =>
      resolveBaseMarker(
        "$exprSeries",
        { over: "u", expr: "u*u", resolution: 3 },
        { domain: null, domainGrids, varContext: {} },
      ),
    ).toThrow(/resolution requires model.domain/);
  });

  it("$expr evaluates a scalar from varContext only", () => {
    expect(resolveBaseMarker("$expr", "R * 2", { domainGrids: null, varContext: { R: 3 } })).toBe(6);
  });

  it("resolves named-axis markers without exposing legacy u/v", () => {
    const domain = parseComputeDomain({
      axes: [
        { name: "theta", min: 0, max: Math.PI, resolution: 3 },
        { name: "phi", min: 0, max: 1, resolution: 2 },
      ],
    })!;
    const namedGrids = buildDomainGrids(domain);

    expect(
      resolveBaseMarker("$grid", { axis: "theta" }, { domain, domainGrids: namedGrids, varContext: {} }),
    ).toEqual(namedGrids.theta);
    expect(
      resolveBaseMarker(
        "$exprGrid",
        { over: ["theta", "phi"], expr: "sin(theta) + phi" },
        { domain, domainGrids: namedGrids, varContext: {} },
      ),
    ).toHaveLength(namedGrids.phi.length);
    const grid = resolveBaseMarker(
      "$exprGrid",
      { over: ["theta", "phi"], expr: "sin(theta) + phi" },
      { domain, domainGrids: namedGrids, varContext: {} },
    ) as number[][];
    expect(grid[0]).toHaveLength(namedGrids.theta.length);
    expect(grid[0]![0]).toBeCloseTo(0);
    expect(grid.at(-1)?.at(-1)).toBeCloseTo(1);
    expect(() =>
      resolveBaseMarker("$exprGrid", { over: ["theta", "phi"], expr: "u" }, {
        domain,
        domainGrids: namedGrids,
        varContext: {},
      }),
    ).toThrow(/unknown identifier.*"u"/);
  });

  it("throws on disallowed expressions with an actionable diagnosis", () => {
    expect(() =>
      resolveBaseMarker("$expr", "eval('1')", { domainGrids: null, varContext: {} }),
    ).toThrow(/forbidden/);
    expect(() =>
      resolveBaseMarker("$expr", "R * 2", { domainGrids: null, varContext: {} }),
    ).toThrow(/unknown identifier.*"R"/);
  });
});

describe("walkResolveMarkers", () => {
  const domainGrids = buildDomainGrids({ uMin: -1, uMax: 1, vMin: -1, vMax: 1, resolution: 2 });

  it("resolves nested markers and passes through plain values", () => {
    const resolved = walkResolveMarkers(
      { type: "surface", x: { $grid: "u" }, title: "demo", n: 3 },
      { domainGrids, varContext: {} },
    ) as Record<string, unknown>;
    expect(resolved.x).toEqual(domainGrids.u);
    expect(resolved.title).toBe("demo");
    expect(resolved.n).toBe(3);
  });

  it("delegates unknown extra markers to resolveExtra", () => {
    const resolved = walkResolveMarkers(
      { z: { $state: "x" } },
      { domainGrids: null, varContext: {} },
      ["$state"],
      (key, raw) => (key === "$state" ? `resolved:${String(raw)}` : raw),
    ) as Record<string, unknown>;
    expect(resolved.z).toBe("resolved:x");
  });

  it("throws on ambiguous marker objects", () => {
    expect(() =>
      walkResolveMarkers({ z: { $grid: "u", $expr: "1" } }, { domainGrids, varContext: {} }),
    ).toThrow(/ambiguous/);
  });

  it("throws when an extra marker key has no resolver", () => {
    expect(() =>
      walkResolveMarkers({ z: { $state: "x" } }, { domainGrids, varContext: {} }, ["$state"]),
    ).toThrow(/not supported/);
  });
});

describe("checkNoLiteralGridArrays", () => {
  it("rejects a literal array on a surface trace regardless of size", () => {
    const result = checkNoLiteralGridArrays({
      data: [{ type: "surface", x: [-1, 0, 1], y: [-1, 0, 1], z: [[1, 0, 1], [0, -1, 0], [1, 0, 1]] }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/literal array/);
  });

  it("accepts a surface trace using compute markers", () => {
    const result = checkNoLiteralGridArrays({
      data: [
        {
          type: "surface",
          x: { $exprGrid: "cos(u)" },
          y: { $exprGrid: "sin(u)" },
          z: { $grid: "v" },
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("checks frames too", () => {
    const result = checkNoLiteralGridArrays({
      data: [{ type: "surface", z: { $grid: "u" } }],
      frames: [{ name: "f0", data: [{ z: [[1, 2], [3, 4]] }] }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/frames\[0\]/);
  });

  it("rejects a literal array on a lines-mode scatter trace", () => {
    const result = checkNoLiteralGridArrays({
      data: [{ type: "scatter", mode: "lines", x: [0, 1, 2], y: [0, 1, 4] }],
    });
    expect(result.ok).toBe(false);
  });

  it("allows literal arrays on markers-mode scatter (discrete/real data)", () => {
    const result = checkNoLiteralGridArrays({
      data: [{ type: "scatter", mode: "markers", x: [0, 1, 2], y: [5, 3, 9] }],
    });
    expect(result.ok).toBe(true);
  });

  it("allows literal arrays on categorical trace types (bar/pie)", () => {
    const result = checkNoLiteralGridArrays({
      data: [{ type: "bar", x: ["A", "B", "C"], y: [10, 20, 30] }],
    });
    expect(result.ok).toBe(true);
  });

  it("passes through non-object / empty input", () => {
    expect(checkNoLiteralGridArrays(null).ok).toBe(true);
    expect(checkNoLiteralGridArrays({}).ok).toBe(true);
  });
});
