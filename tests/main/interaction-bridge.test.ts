import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: () => path.join(os.tmpdir(), "prism-ix-bridge-userdata"),
  },
  BrowserWindow: {
    getAllWindows: () => [],
  },
}));

const { scheduleInteractionThumbnailMock } = vi.hoisted(() => ({
  scheduleInteractionThumbnailMock: vi.fn(),
}));
vi.mock("../../src/main/services/interaction-thumbnail", () => ({
  scheduleInteractionThumbnail: scheduleInteractionThumbnailMock,
}));

import { processInteractionBridgeOnceForTests } from "../../src/main/services/interaction-bridge";
import { getInteractionBridgeRoot } from "../../src/main/services/prism-bridge-paths";

const bridgeRoot = path.join(os.tmpdir(), "prism-interaction-bridge-test");
const projectRoots: string[] = [];

beforeEach(() => {
  process.env.PRISM_INTERACTION_BRIDGE_ROOT = bridgeRoot;
  fs.mkdirSync(bridgeRoot, { recursive: true });
  scheduleInteractionThumbnailMock.mockClear();
});

afterEach(() => {
  for (const root of projectRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
  if (fs.existsSync(bridgeRoot)) {
    fs.rmSync(bridgeRoot, { recursive: true, force: true });
  }
});

describe("interaction-bridge", () => {
  it("writes spec and returns fence hint", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ix-bridge-proj-"));
    projectRoots.push(projectRoot);
    const sessionId = "test-session";
    const sessionDir = path.join(getInteractionBridgeRoot(), sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });
    const requestId = "req-1";
    fs.writeFileSync(
      path.join(sessionDir, `${requestId}.request.json`),
      JSON.stringify({
        action: "write",
        sessionId,
        projectRoot,
        spec: {
          id: "demo.plot",
          title: "Demo loss",
          kind: "plot.line",
          compute: "local",
          revision: 1,
        },
      }),
      "utf-8",
    );

    await processInteractionBridgeOnceForTests();

    const result = JSON.parse(
      fs.readFileSync(path.join(sessionDir, `${requestId}.result.json`), "utf-8"),
    ) as Record<string, unknown>;
    expect(result.ok).toBe(true);
    expect(result.fenceMarkdown).toContain("```interaction");
    expect(result.fenceMarkdown).toContain("id: demo.plot");
    expect(result.relativePath).toBe(".prismnext/artifacts/demo.plot/spec.json");
  });

  it("schedules a thumbnail capture after a successful figure.plotly/instrument/figure.script write, not for plot.*/figure.static", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ix-bridge-thumb-"));
    projectRoots.push(projectRoot);
    const sessionId = "test-session-thumb";
    const sessionDir = path.join(getInteractionBridgeRoot(), sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });

    async function write(requestId: string, spec: Record<string, unknown>) {
      fs.writeFileSync(
        path.join(sessionDir, `${requestId}.request.json`),
        JSON.stringify({ action: "write", sessionId, projectRoot, spec }),
        "utf-8",
      );
      await processInteractionBridgeOnceForTests();
      return JSON.parse(
        fs.readFileSync(path.join(sessionDir, `${requestId}.result.json`), "utf-8"),
      ) as Record<string, unknown>;
    }

    const plotly = await write("req-thumb-plotly", {
      id: "demo.thumb.plotly",
      title: "Plotly",
      kind: "figure.plotly",
      compute: "local",
      revision: 1,
      model: { figure: { data: [{ type: "scatter", x: [1], y: [1] }] } },
    });
    expect(plotly.ok).toBe(true);
    expect(scheduleInteractionThumbnailMock).toHaveBeenCalledTimes(1);
    expect(scheduleInteractionThumbnailMock.mock.calls[0]![0]).toBe(projectRoot);
    expect((scheduleInteractionThumbnailMock.mock.calls[0]![1] as { id: string }).id).toBe(
      "demo.thumb.plotly",
    );

    scheduleInteractionThumbnailMock.mockClear();
    const instrument = await write("req-thumb-instrument", {
      id: "demo.thumb.instrument",
      title: "Instrument",
      kind: "instrument",
      compute: "local",
      revision: 1,
      model: {
        runtimeVersion: 1,
        figureTemplate: { data: [{ type: "scatter", x: [1], y: [{ $expr: "1" }] }] },
      },
    });
    expect(instrument.ok).toBe(true);
    expect(scheduleInteractionThumbnailMock).toHaveBeenCalledTimes(1);

    scheduleInteractionThumbnailMock.mockClear();
    const scriptDir = path.join(projectRoot, ".prismnext", "artifacts", "demo.thumb.script");
    fs.mkdirSync(scriptDir, { recursive: true });
    fs.writeFileSync(
      path.join(scriptDir, "script.js"),
      "export function render(ctx) { return ctx.Plotly.newPlot(ctx.el, [], {}); }",
      "utf-8",
    );
    const script = await write("req-thumb-script", {
      id: "demo.thumb.script",
      title: "Script",
      kind: "figure.script",
      compute: "local",
      revision: 1,
      resources: [{ role: "script", path: "script.js" }],
    });
    expect(script.ok).toBe(true);
    expect(scheduleInteractionThumbnailMock).toHaveBeenCalledTimes(1);

    scheduleInteractionThumbnailMock.mockClear();
    const plot = await write("req-thumb-plot", {
      id: "demo.thumb.plot",
      title: "Plot",
      kind: "plot.line",
      compute: "local",
      revision: 1,
    });
    expect(plot.ok).toBe(true);
    expect(scheduleInteractionThumbnailMock).not.toHaveBeenCalled();
  });

  it("rejects retired legacy kinds (scene.ir, scene.program, math.surface, math.field) with a migration hint and does not write spec.json", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ix-bridge-proj-"));
    projectRoots.push(projectRoot);
    const sessionId = "test-session-legacy";
    const sessionDir = path.join(getInteractionBridgeRoot(), sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });

    for (const kind of ["scene.ir", "scene.program", "math.surface", "math.field"]) {
      const requestId = `req-${kind.replace(".", "-")}`;
      const id = `demo.${kind.replace(".", "-")}`;
      fs.writeFileSync(
        path.join(sessionDir, `${requestId}.request.json`),
        JSON.stringify({
          action: "write",
          sessionId,
          projectRoot,
          spec: {
            id,
            title: "Legacy",
            kind,
            compute: "local",
            revision: 1,
          },
        }),
        "utf-8",
      );
      await processInteractionBridgeOnceForTests();
      const result = JSON.parse(
        fs.readFileSync(path.join(sessionDir, `${requestId}.result.json`), "utf-8"),
      ) as Record<string, unknown>;
      expect(result.ok, `expected ${kind} write to be rejected`).toBe(false);
      expect(String(result.error)).toMatch(/retired|figure\.plotly|instrument/i);
      expect(result.sample).toBeTruthy();
      expect(
        fs.existsSync(path.join(projectRoot, ".prismnext", "artifacts", id, "spec.json")),
      ).toBe(false);
    }
  });

  it("rejects figure.static without resources and accepts when PNG exists", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ix-bridge-fig-"));
    projectRoots.push(projectRoot);
    const artifactDir = path.join(
      projectRoot,
      ".prismnext",
      "artifacts",
      "riemann-curvature-heatmap",
    );
    fs.mkdirSync(artifactDir, { recursive: true });
    fs.writeFileSync(path.join(artifactDir, "curvature_heatmap.png"), "fake-png", "utf-8");

    const sessionId = "test-session-figure";
    const sessionDir = path.join(getInteractionBridgeRoot(), sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });

    const badId = "req-fig-no-resources";
    fs.writeFileSync(
      path.join(sessionDir, `${badId}.request.json`),
      JSON.stringify({
        action: "write",
        sessionId,
        projectRoot,
        spec: {
          id: "riemann-curvature-heatmap",
          title: "Curvature heatmap",
          kind: "figure.static",
          compute: "local",
          revision: 1,
        },
      }),
      "utf-8",
    );
    await processInteractionBridgeOnceForTests();
    const bad = JSON.parse(
      fs.readFileSync(path.join(sessionDir, `${badId}.result.json`), "utf-8"),
    ) as Record<string, unknown>;
    expect(bad.ok).toBe(false);
    expect(String(bad.error)).toMatch(/resources/i);

    const okId = "req-fig-ok";
    fs.writeFileSync(
      path.join(sessionDir, `${okId}.request.json`),
      JSON.stringify({
        action: "write",
        sessionId,
        projectRoot,
        spec: {
          id: "riemann-curvature-heatmap",
          title: "Curvature heatmap",
          kind: "figure.static",
          compute: "local",
          revision: 1,
          resources: [{ role: "figure", path: "curvature_heatmap.png" }],
        },
      }),
      "utf-8",
    );
    await processInteractionBridgeOnceForTests();
    const ok = JSON.parse(
      fs.readFileSync(path.join(sessionDir, `${okId}.result.json`), "utf-8"),
    ) as Record<string, unknown>;
    expect(ok.ok).toBe(true);
  });

  it("rejects invalid figure.plotly with a copyable sample and does not write spec.json", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ix-bridge-plotly-"));
    projectRoots.push(projectRoot);
    const sessionId = "test-session-plotly";
    const sessionDir = path.join(getInteractionBridgeRoot(), sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });

    const requestId = "req-plotly-bad";
    fs.writeFileSync(
      path.join(sessionDir, `${requestId}.request.json`),
      JSON.stringify({
        action: "write",
        sessionId,
        projectRoot,
        spec: {
          id: "demo.bad",
          title: "Bad",
          kind: "figure.plotly",
          compute: "local",
          revision: 1,
          model: { figure: { data: [] } },
        },
      }),
      "utf-8",
    );
    await processInteractionBridgeOnceForTests();
    const result = JSON.parse(
      fs.readFileSync(path.join(sessionDir, `${requestId}.result.json`), "utf-8"),
    ) as Record<string, unknown>;
    expect(result.ok).toBe(false);
    expect(result.phase).toBe("compile-preview");
    expect(result.sample).toBeTruthy();
    expect(
      fs.existsSync(path.join(projectRoot, ".prismnext", "artifacts", "demo.bad", "spec.json")),
    ).toBe(false);
  });

  it("rejects sceneSource on figure.plotly writes", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ix-bridge-plotly-src-"));
    projectRoots.push(projectRoot);
    const sessionId = "test-session-plotly-src";
    const sessionDir = path.join(getInteractionBridgeRoot(), sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });

    const requestId = "req-plotly-scenesource";
    fs.writeFileSync(
      path.join(sessionDir, `${requestId}.request.json`),
      JSON.stringify({
        action: "write",
        sessionId,
        projectRoot,
        spec: {
          id: "demo.saddle",
          title: "Saddle",
          kind: "figure.plotly",
          compute: "local",
          revision: 1,
          model: { figure: { data: [{ type: "surface", z: [[0, 1]] }] } },
        },
        sceneSource: "export async function mount() {}",
      }),
      "utf-8",
    );
    await processInteractionBridgeOnceForTests();
    const result = JSON.parse(
      fs.readFileSync(path.join(sessionDir, `${requestId}.result.json`), "utf-8"),
    ) as Record<string, unknown>;
    expect(result.ok).toBe(false);
    expect(String(result.error)).toMatch(/sceneSource/);
    expect(result.sample).toBeTruthy();
  });

  it("rejects invalid instrument with a copyable sample and does not write spec.json", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ix-bridge-instrument-"));
    projectRoots.push(projectRoot);
    const sessionId = "test-session-instrument";
    const sessionDir = path.join(getInteractionBridgeRoot(), sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });

    const requestId = "req-instrument-bad";
    fs.writeFileSync(
      path.join(sessionDir, `${requestId}.request.json`),
      JSON.stringify({
        action: "write",
        sessionId,
        projectRoot,
        spec: {
          id: "demo.bad",
          title: "Bad",
          kind: "instrument",
          compute: "local",
          revision: 1,
          model: {
            runtimeVersion: 1,
            figureTemplate: { data: [{ type: "scatter", x: [{ $expr: "eval('1')" }] }] },
          },
        },
      }),
      "utf-8",
    );
    await processInteractionBridgeOnceForTests();
    const result = JSON.parse(
      fs.readFileSync(path.join(sessionDir, `${requestId}.result.json`), "utf-8"),
    ) as Record<string, unknown>;
    expect(result.ok).toBe(false);
    expect(result.phase).toBe("compile-preview");
    expect(result.sample).toBeTruthy();
    expect(
      fs.existsSync(path.join(projectRoot, ".prismnext", "artifacts", "demo.bad", "spec.json")),
    ).toBe(false);
  });

  it("rejects sceneSource on instrument writes", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ix-bridge-instrument-src-"));
    projectRoots.push(projectRoot);
    const sessionId = "test-session-instrument-src";
    const sessionDir = path.join(getInteractionBridgeRoot(), sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });

    const requestId = "req-instrument-scenesource";
    fs.writeFileSync(
      path.join(sessionDir, `${requestId}.request.json`),
      JSON.stringify({
        action: "write",
        sessionId,
        projectRoot,
        spec: {
          id: "demo.saddle-instrument",
          title: "Saddle instrument",
          kind: "instrument",
          compute: "local",
          revision: 1,
          model: {
            runtimeVersion: 1,
            domain: { uMin: -2, uMax: 2, vMin: -2, vMax: 2, resolution: 48 },
            figureTemplate: {
              data: [
                {
                  type: "surface",
                  x: { $grid: "u" },
                  y: { $grid: "v" },
                  z: { $exprGrid: "sin(u) * cos(v)" },
                },
              ],
            },
          },
        },
        sceneSource: "export async function mount() {}",
      }),
      "utf-8",
    );
    await processInteractionBridgeOnceForTests();
    const result = JSON.parse(
      fs.readFileSync(path.join(sessionDir, `${requestId}.result.json`), "utf-8"),
    ) as Record<string, unknown>;
    expect(result.ok).toBe(false);
    expect(String(result.error)).toMatch(/sceneSource/);
    expect(result.sample).toBeTruthy();
  });

  it("rejects figure.script with a missing script resource, with a copyable sample", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ix-bridge-script-"));
    projectRoots.push(projectRoot);
    const sessionId = "test-session-script-bad";
    const sessionDir = path.join(getInteractionBridgeRoot(), sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });

    const requestId = "req-script-bad";
    fs.writeFileSync(
      path.join(sessionDir, `${requestId}.request.json`),
      JSON.stringify({
        action: "write",
        sessionId,
        projectRoot,
        spec: {
          id: "demo.script.bad",
          title: "Bad script",
          kind: "figure.script",
          compute: "local",
          revision: 1,
        },
      }),
      "utf-8",
    );
    await processInteractionBridgeOnceForTests();
    const result = JSON.parse(
      fs.readFileSync(path.join(sessionDir, `${requestId}.result.json`), "utf-8"),
    ) as Record<string, unknown>;
    expect(result.ok).toBe(false);
    expect(result.phase).toBe("compile-preview");
    expect(result.sample).toBeTruthy();
    expect(
      fs.existsSync(
        path.join(projectRoot, ".prismnext", "artifacts", "demo.script.bad", "spec.json"),
      ),
    ).toBe(false);
  });

  it("rejects sceneSource on figure.script writes, accepts a valid one", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ix-bridge-script-src-"));
    projectRoots.push(projectRoot);
    const artifactDir = path.join(projectRoot, ".prismnext", "artifacts", "demo.script.good");
    fs.mkdirSync(artifactDir, { recursive: true });
    fs.writeFileSync(
      path.join(artifactDir, "script.js"),
      "export function render(ctx) { return ctx.Plotly.newPlot(ctx.el, [], {}); }",
      "utf-8",
    );
    const sessionId = "test-session-script-src";
    const sessionDir = path.join(getInteractionBridgeRoot(), sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });

    const rejectedId = "req-script-scenesource";
    fs.writeFileSync(
      path.join(sessionDir, `${rejectedId}.request.json`),
      JSON.stringify({
        action: "write",
        sessionId,
        projectRoot,
        spec: {
          id: "demo.script.good",
          title: "Good script",
          kind: "figure.script",
          compute: "local",
          revision: 1,
          resources: [{ role: "script", path: "script.js" }],
        },
        sceneSource: "export async function mount() {}",
      }),
      "utf-8",
    );
    await processInteractionBridgeOnceForTests();
    const rejected = JSON.parse(
      fs.readFileSync(path.join(sessionDir, `${rejectedId}.result.json`), "utf-8"),
    ) as Record<string, unknown>;
    expect(rejected.ok).toBe(false);
    expect(String(rejected.error)).toMatch(/sceneSource/);

    const okId = "req-script-ok";
    fs.writeFileSync(
      path.join(sessionDir, `${okId}.request.json`),
      JSON.stringify({
        action: "write",
        sessionId,
        projectRoot,
        spec: {
          id: "demo.script.good",
          title: "Good script",
          kind: "figure.script",
          compute: "local",
          revision: 1,
          resources: [{ role: "script", path: "script.js" }],
        },
      }),
      "utf-8",
    );
    await processInteractionBridgeOnceForTests();
    const ok = JSON.parse(
      fs.readFileSync(path.join(sessionDir, `${okId}.result.json`), "utf-8"),
    ) as Record<string, unknown>;
    expect(ok.ok).toBe(true);
    expect(scheduleInteractionThumbnailMock).toHaveBeenCalledTimes(1);
  });
});
