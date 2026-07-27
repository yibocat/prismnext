import { describe, expect, it } from "vitest";
import {
  isValidInteractionId,
  kindDisplayLabel,
  parseInteractionSpec,
  buildInteractionFenceMarkdown,
  interactionFenceHint,
  isAllowedInteractionKind,
} from "../../src/shared/interaction-spec";
import {
  resolveFigureDisplay,
  pickFigureResourcePath,
  pickHtmlResourcePath,
  injectFigureHtmlCsp,
  FIGURE_MAX_BYTES,
} from "../../src/shared/interaction-figure";
import {
  resolveSceneEntry,
  isBuiltinSceneEntry,
  BUILTIN_SCENE_LORENZ,
} from "../../src/shared/interaction-scene";

describe("isValidInteractionId", () => {
  it("accepts safe ids and rejects traversal", () => {
    expect(isValidInteractionId("plot.loss")).toBe(true);
    expect(isValidInteractionId("a")).toBe(true);
    expect(isValidInteractionId("")).toBe(false);
    expect(isValidInteractionId("..")).toBe(false);
    expect(isValidInteractionId("a/b")).toBe(false);
  });
});

describe("parseInteractionSpec", () => {
  it("parses a minimal valid spec", () => {
    expect(
      parseInteractionSpec({
        id: "plot.loss",
        title: "Loss curve",
        kind: "plot.line",
        compute: "local",
        revision: 1,
      }),
    ).toEqual({
      id: "plot.loss",
      title: "Loss curve",
      kind: "plot.line",
      compute: "local",
      revision: 1,
    });
  });

  it("preserves optional sections including entry", () => {
    const spec = parseInteractionSpec({
      id: "plot.bound",
      title: "Bound plot",
      kind: "plot.scatter",
      compute: "bound",
      revision: 2,
      entry: "scene.js",
      params: { x: 1 },
      bindings: { csv: { path: "out/m.csv" } },
      resources: [{ path: "out/m.csv" }],
    });
    expect(spec?.params).toEqual({ x: 1 });
    expect(spec?.bindings).toEqual({ csv: { path: "out/m.csv" } });
    expect(spec?.resources).toEqual([{ path: "out/m.csv" }]);
    expect(spec?.entry).toBe("scene.js");
  });

  it("rejects invalid payloads", () => {
    expect(parseInteractionSpec(null)).toBeNull();
    expect(parseInteractionSpec({ id: "x", title: "", kind: "plot", compute: "local", revision: 1 })).toBeNull();
    expect(parseInteractionSpec({ id: "x", title: "T", kind: "plot", compute: "remote", revision: 1 })).toBeNull();
  });
});

describe("kindDisplayLabel", () => {
  it("maps known prefixes", () => {
    expect(kindDisplayLabel("plot.line")).toBe("Plot");
    expect(kindDisplayLabel("math.surface")).toBe("Math");
    expect(kindDisplayLabel("figure.static")).toBe("Figure");
    expect(kindDisplayLabel("scene.program")).toBe("Scene");
    expect(kindDisplayLabel("custom")).toBe("Custom");
  });
});

describe("interaction agent helpers", () => {
  it("builds fence markdown and hint", () => {
    expect(buildInteractionFenceMarkdown("demo.plot", "Demo")).toContain("id: demo.plot");
    const hint = interactionFenceHint("demo.plot", "Demo");
    expect(hint.fenceMarkdown).toContain("```interaction");
    expect(hint.replyRule).toMatch(/assistant/i);
  });

  it("validates allowed kinds for agent write", () => {
    expect(isAllowedInteractionKind("plot.line")).toBe(true);
    expect(isAllowedInteractionKind("figure.static")).toBe(true);
    expect(isAllowedInteractionKind("scene.program")).toBe(true);
    expect(isAllowedInteractionKind("scene.ir")).toBe(true);
    expect(isAllowedInteractionKind("custom.widget")).toBe(false);
  });
});

describe("figure resources", () => {
  it("picks figure and html by role or extension", () => {
    expect(
      pickFigureResourcePath([
        { role: "data", path: "a.csv" },
        { role: "figure", path: "out/plot.png" },
      ]),
    ).toBe("out/plot.png");
    expect(pickHtmlResourcePath([{ path: "viz/index.html" }])).toBe("viz/index.html");
  });

  it("resolves display mode", () => {
    const base = {
      id: "fig.demo",
      title: "Fig",
      kind: "figure.static",
      compute: "bound" as const,
      revision: 1,
    };
    expect(
      resolveFigureDisplay({
        ...base,
        resources: [{ role: "figure", path: "a.png" }],
      }),
    ).toEqual({ ok: true, mode: "image", path: ".prismnext/artifacts/fig.demo/a.png" });
    expect(
      resolveFigureDisplay({
        ...base,
        resources: [{ role: "html", path: "a.html" }],
      }),
    ).toEqual({ ok: true, mode: "html", path: ".prismnext/artifacts/fig.demo/a.html" });
    expect(resolveFigureDisplay({ ...base, resources: [] }).ok).toBe(false);
  });

  it("keeps experiment/ resource paths as-is (bound to real run output, not artifact-relative)", () => {
    const base = {
      id: "fig.bound",
      title: "Bound fig",
      kind: "figure.static",
      compute: "bound" as const,
      revision: 1,
    };
    expect(
      resolveFigureDisplay({
        ...base,
        resources: [{ role: "figure", path: "experiment/exp-1/results/loss.png" }],
      }),
    ).toEqual({ ok: true, mode: "image", path: "experiment/exp-1/results/loss.png" });
  });

  it("injects a network-denying CSP into agent-generated HTML", () => {
    const withHead = injectFigureHtmlCsp("<html><head><title>x</title></head><body>hi</body></html>");
    expect(withHead).toContain('<meta http-equiv="Content-Security-Policy"');
    expect(withHead.indexOf("Content-Security-Policy")).toBeLessThan(withHead.indexOf("<title>"));
    expect(withHead).toContain("connect-src 'none'");

    const withHtmlOnly = injectFigureHtmlCsp("<html><body>hi</body></html>");
    expect(withHtmlOnly).toMatch(/<html[^>]*><head><meta http-equiv="Content-Security-Policy"/);

    const bare = injectFigureHtmlCsp("<div>hi</div>");
    expect(bare.startsWith('<meta http-equiv="Content-Security-Policy"')).toBe(true);
  });

  it("caps figure resource size to a sane bound", () => {
    expect(FIGURE_MAX_BYTES).toBeGreaterThan(1024 * 1024);
    expect(FIGURE_MAX_BYTES).toBeLessThanOrEqual(64 * 1024 * 1024);
  });
});

describe("scene entry", () => {
  it("defaults to scene.js (not Lorenz) and rejects traversal", () => {
    const base = {
      id: "turbulence.karman",
      title: "Karman",
      kind: "scene.program",
      compute: "local" as const,
      revision: 1,
    };
    expect(resolveSceneEntry(base)).toBe("scene.js");
    expect(resolveSceneEntry({ ...base, entry: "builtin:lorenz" })).toBe("builtin:lorenz");
    expect(isBuiltinSceneEntry("builtin:lorenz")).toBe(true);
    expect(resolveSceneEntry({ ...base, entry: "../evil.js" })).toBeNull();
    expect(resolveSceneEntry({ ...base, entry: "scene.js" })).toBe("scene.js");
    expect(resolveSceneEntry({ ...base, entry: "scene.ts" })).toBeNull();
  });

  it("infers script path from resources when entry omitted", () => {
    expect(
      resolveSceneEntry({
        id: "x",
        title: "X",
        kind: "scene.program",
        compute: "local",
        revision: 1,
        resources: [{ role: "script", path: "scene.js" }],
      }),
    ).toBe("scene.js");
  });
});
