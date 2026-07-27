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

import { processInteractionBridgeOnceForTests } from "../../src/main/services/interaction-bridge";
import { getInteractionBridgeRoot } from "../../src/main/services/prism-bridge-paths";

const bridgeRoot = path.join(os.tmpdir(), "prism-interaction-bridge-test");
const projectRoots: string[] = [];

beforeEach(() => {
  process.env.PRISM_INTERACTION_BRIDGE_ROOT = bridgeRoot;
  fs.mkdirSync(bridgeRoot, { recursive: true });
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

  it("rejects scene.program sceneSource and accepts scene.ir model", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ix-bridge-proj-"));
    projectRoots.push(projectRoot);
    const sessionId = "test-session-scene";
    const sessionDir = path.join(getInteractionBridgeRoot(), sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });

    const rejectJsId = "req-scene-js";
    fs.writeFileSync(
      path.join(sessionDir, `${rejectJsId}.request.json`),
      JSON.stringify({
        action: "write",
        sessionId,
        projectRoot,
        spec: {
          id: "cube.simple",
          title: "Cube",
          kind: "scene.program",
          compute: "local",
          revision: 1,
        },
        sceneSource: `export async function mount(ctx) {
  const handle = await ctx.three.ensure();
  const { THREE, content } = handle;
  content.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x3366ff })));
}
`,
      }),
      "utf-8",
    );
    await processInteractionBridgeOnceForTests();
    const rejected = JSON.parse(
      fs.readFileSync(path.join(sessionDir, `${rejectJsId}.result.json`), "utf-8"),
    ) as Record<string, unknown>;
    expect(rejected.ok).toBe(false);
    expect(String(rejected.error)).toMatch(/scene\.ir|no longer accepts sceneSource/i);

    const irId = "req-scene-ir";
    fs.writeFileSync(
      path.join(sessionDir, `${irId}.request.json`),
      JSON.stringify({
        action: "write",
        sessionId,
        projectRoot,
        spec: {
          id: "demo.paraboloid",
          title: "Paraboloid",
          kind: "scene.ir",
          compute: "local",
          revision: 1,
          bindings: {
            R: { min: 0.5, max: 5, step: 0.1, default: 2, label: "R" },
            sampleU: { min: -1.4, max: 1.4, step: 0.05, default: 0.5, label: "u" },
            sampleV: { min: -1.4, max: 1.4, step: 0.05, default: 0.5, label: "v" },
            metricType: { min: 0, max: 2, step: 1, default: 0, label: "metric" },
            lambda: { min: 0.1, max: 5, step: 0.1, default: 1.5, label: "lambda" },
          },
          model: {
            runtimeVersion: 1,
            surface: {
              type: "parametric",
              domain: { uMin: -1.4, uMax: 1.4, vMin: -1.4, vMax: 1.4, resolution: 32 },
              x: "u",
              y: "(u*u + v*v) / R",
              z: "v",
            },
            probe: { uKey: "sampleU", vKey: "sampleV" },
            metric: { modeKey: "metricType", modes: ["induced", "conformal", "spherical"] },
          },
        },
      }),
      "utf-8",
    );
    await processInteractionBridgeOnceForTests();
    const ir = JSON.parse(
      fs.readFileSync(path.join(sessionDir, `${irId}.result.json`), "utf-8"),
    ) as Record<string, unknown>;
    expect(ir.ok).toBe(true);
    expect(
      fs.existsSync(path.join(projectRoot, ".prismnext", "artifacts", "demo.paraboloid", "spec.json")),
    ).toBe(true);
    const written = JSON.parse(
      fs.readFileSync(
        path.join(projectRoot, ".prismnext", "artifacts", "demo.paraboloid", "spec.json"),
        "utf-8",
      ),
    ) as Record<string, unknown>;
    expect(written.kind).toBe("scene.ir");
    expect(written.id).toBe("demo.paraboloid");
  });

  it("rejects scene.ir when compile-preview fails and does not write spec.json", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ix-bridge-proj-"));
    projectRoots.push(projectRoot);
    const sessionId = "test-session-ir-preview-fail";
    const sessionDir = path.join(getInteractionBridgeRoot(), sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });
    const requestId = "req-ir-preview-fail";
    fs.writeFileSync(
      path.join(sessionDir, `${requestId}.request.json`),
      JSON.stringify({
        action: "write",
        sessionId,
        projectRoot,
        spec: {
          id: "bad.preview",
          title: "Bad preview",
          kind: "scene.ir",
          compute: "local",
          revision: 1,
          bindings: {
            sampleU: { min: -1, max: 1, step: 0.1, default: 0, label: "u" },
            sampleV: { min: -1, max: 1, step: 0.1, default: 0, label: "v" },
          },
          model: {
            runtimeVersion: 1,
            surface: {
              type: "parametric",
              domain: { uMin: -1, uMax: 1, vMin: -1, vMax: 1, resolution: 8 },
              x: "u",
              y: "1/0",
              z: "v",
            },
            probe: { uKey: "sampleU", vKey: "sampleV" },
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
    expect(String(result.error)).toMatch(/finite number/i);
    expect(
      fs.existsSync(path.join(projectRoot, ".prismnext", "artifacts", "bad.preview", "spec.json")),
    ).toBe(false);
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
});
