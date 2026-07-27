import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PLOTLY_SAMPLE_FIGURE } from "../../src/shared/interaction-plotly";
import { INSTRUMENT_SAMPLE_MODEL } from "../../src/shared/interaction-instrument";
import { SCRIPT_SAMPLE_JS } from "../../src/shared/interaction-script";
import type { InteractionSpec } from "../../src/shared/interaction-spec";

const { thumbTempDir } = vi.hoisted(() => {
  const fs = require("node:fs") as typeof import("node:fs");
  const os = require("node:os") as typeof import("node:os");
  const path = require("node:path") as typeof import("node:path");
  return { thumbTempDir: fs.mkdtempSync(path.join(os.tmpdir(), "ix-thumb-electron-tmp-")) };
});

type MockWindowInstance = {
  opts: Record<string, unknown>;
  destroyed: boolean;
  webContents: {
    executeJavaScript: ReturnType<typeof vi.fn>;
    capturePage: ReturnType<typeof vi.fn>;
  };
  loadFile: ReturnType<typeof vi.fn>;
  isDestroyed: () => boolean;
  destroy: () => void;
};

let mockWindows: MockWindowInstance[] = [];
let mockAppWindows: { isDestroyed: () => boolean; webContents: { send: (...a: unknown[]) => void } }[] = [];
let nextExecuteJavaScriptResult: unknown = { ready: true };
let executeJavaScriptShouldHang = false;

vi.mock("electron", () => {
  class MockBrowserWindow {
    opts: Record<string, unknown>;
    destroyed = false;
    webContents = {
      executeJavaScript: vi.fn(async () => {
        if (executeJavaScriptShouldHang) return new Promise(() => {});
        return nextExecuteJavaScriptResult;
      }),
      capturePage: vi.fn(async () => ({
        toPNG: () => Buffer.from("fake-png-bytes"),
      })),
    };
    loadFile = vi.fn(async () => {});
    constructor(opts: Record<string, unknown>) {
      this.opts = opts;
      mockWindows.push(this as unknown as MockWindowInstance);
    }
    isDestroyed() {
      return this.destroyed;
    }
    destroy() {
      this.destroyed = true;
    }
    static getAllWindows() {
      return mockAppWindows;
    }
  }
  return {
    BrowserWindow: MockBrowserWindow,
    app: { getPath: () => thumbTempDir },
  };
});

import {
  resolveFigureForThumbnail,
  resolveScriptForThumbnail,
  resolveDiagramForThumbnail,
  renderFigureToPngBuffer,
  captureInteractionThumbnail,
  scheduleInteractionThumbnail,
} from "../../src/main/services/interaction-thumbnail";
import * as interactionStore from "../../src/main/services/interaction-store";

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

describe("resolveScriptForThumbnail", () => {
  it("builds sandbox HTML for a valid figure.script spec", () => {
    const root = mkdtempSync(join(tmpdir(), "ix-thumb-script-"));
    const dir = join(root, ".prismnext", "artifacts", "demo.script");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "script.js"), SCRIPT_SAMPLE_JS, "utf8");

    const spec = baseSpec({
      id: "demo.script",
      kind: "figure.script",
      resources: [{ role: "script", path: "script.js" }],
    });
    const result = resolveScriptForThumbnail(root, spec);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.html).toContain("render");
      expect(result.html).toContain('<script type="module">');
    }

    rmSync(root, { recursive: true, force: true });
  });

  it("fails closed when the spec fails validateScriptSpec", () => {
    const root = mkdtempSync(join(tmpdir(), "ix-thumb-script-"));
    const spec = baseSpec({ id: "demo.script.missing", kind: "figure.script" });
    const result = resolveScriptForThumbnail(root, spec);
    expect(result.ok).toBe(false);

    rmSync(root, { recursive: true, force: true });
  });

  it("embeds THREE's module bundle when model.three is true", () => {
    const root = mkdtempSync(join(tmpdir(), "ix-thumb-script-"));
    const dir = join(root, ".prismnext", "artifacts", "demo.script.three");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "script.js"), SCRIPT_SAMPLE_JS, "utf8");

    const spec = baseSpec({
      id: "demo.script.three",
      kind: "figure.script",
      model: { three: true },
      resources: [{ role: "script", path: "script.js" }],
    });
    const result = resolveScriptForThumbnail(root, spec);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.html).toMatch(/export\s*\{/);
    }

    rmSync(root, { recursive: true, force: true });
  });
});

describe("resolveDiagramForThumbnail", () => {
  it("builds self-contained HTML for an inline mermaid spec", () => {
    const spec = baseSpec({
      id: "demo.diagram.mermaid",
      kind: "diagram.mermaid",
      model: { source: "graph TD; A-->B;" },
    });
    const result = resolveDiagramForThumbnail("/tmp/does-not-matter", spec);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.html).toContain("mermaid.render");
      expect(result.html).toContain("graph TD");
    }
  });

  it("builds self-contained HTML for a file-mode dot spec, reading real file content", () => {
    const root = mkdtempSync(join(tmpdir(), "ix-thumb-diagram-"));
    const dir = join(root, ".prismnext", "artifacts", "demo.diagram.dot");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "flow.dot"), "digraph { a -> b; }", "utf8");

    const spec = baseSpec({
      id: "demo.diagram.dot",
      kind: "diagram.mermaid",
      model: { engine: "dot" },
      resources: [{ role: "diagram-source", path: "flow.dot" }],
    });
    const result = resolveDiagramForThumbnail(root, spec);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.html).toContain("Graphviz");
      expect(result.html).toContain("digraph { a -> b; }");
    }

    rmSync(root, { recursive: true, force: true });
  });

  it("fails closed when the diagram source cannot be resolved", () => {
    const spec = baseSpec({ id: "demo.diagram.bad", kind: "diagram.mermaid" });
    const result = resolveDiagramForThumbnail("/tmp/does-not-matter", spec);
    expect(result.ok).toBe(false);
  });

  it("fails closed when a file-mode resource is missing on disk", () => {
    const root = mkdtempSync(join(tmpdir(), "ix-thumb-diagram-"));
    const spec = baseSpec({
      id: "demo.diagram.missing",
      kind: "diagram.mermaid",
      resources: [{ role: "diagram-source", path: "nope.dot" }],
    });
    const result = resolveDiagramForThumbnail(root, spec);
    expect(result.ok).toBe(false);

    rmSync(root, { recursive: true, force: true });
  });
});

describe("renderFigureToPngBuffer (mocked electron)", () => {
  beforeEach(() => {
    mockWindows = [];
    nextExecuteJavaScriptResult = { ready: true };
    executeJavaScriptShouldHang = false;
  });

  afterEach(() => {
    for (const f of readdirSync(thumbTempDir)) {
      if (f.endsWith(".html")) rmSync(join(thumbTempDir, f), { force: true });
    }
  });

  it("happy path: captures a PNG, destroys the window, cleans up the temp file", async () => {
    const result = await renderFigureToPngBuffer(PLOTLY_SAMPLE_FIGURE);
    expect(result.ok).toBe(true);
    if (result.ok) expect(Buffer.isBuffer(result.png)).toBe(true);

    expect(mockWindows).toHaveLength(1);
    expect(mockWindows[0]!.destroyed).toBe(true);
    expect(readdirSync(thumbTempDir).filter((f) => f.endsWith(".html"))).toHaveLength(0);
  });

  it("render error: returns ok:false, still destroys the window and cleans up", async () => {
    nextExecuteJavaScriptResult = { error: "Plotly.newPlot rejected: bad trace" };
    const result = await renderFigureToPngBuffer(PLOTLY_SAMPLE_FIGURE);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/bad trace/);

    expect(mockWindows[0]!.destroyed).toBe(true);
    expect(readdirSync(thumbTempDir).filter((f) => f.endsWith(".html"))).toHaveLength(0);
  });

  it("timeout: returns ok:false after timeoutMs, still destroys the window (no leaked hidden windows)", async () => {
    executeJavaScriptShouldHang = true;
    const result = await renderFigureToPngBuffer(PLOTLY_SAMPLE_FIGURE, { timeoutMs: 30 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/timed? ?out/i);

    expect(mockWindows[0]!.destroyed).toBe(true);
  });
});

describe("captureInteractionThumbnail (mocked electron)", () => {
  let root: string;

  beforeEach(() => {
    mockWindows = [];
    nextExecuteJavaScriptResult = { ready: true };
    executeJavaScriptShouldHang = false;
    root = mkdtempSync(join(tmpdir(), "ix-thumb-capture-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    for (const f of readdirSync(thumbTempDir)) {
      if (f.endsWith(".html")) rmSync(join(thumbTempDir, f), { force: true });
    }
  });

  it("resolver failure short-circuits before touching Electron", async () => {
    const spec = baseSpec({ kind: "figure.static" });
    const result = await captureInteractionThumbnail(root, spec);
    expect(result.ok).toBe(false);
    expect(mockWindows).toHaveLength(0);
    expect(existsSync(interactionStore.interactionThumbnailPath(root, spec.id))).toBe(false);
  });

  it("render failure does not write a thumbnail file", async () => {
    nextExecuteJavaScriptResult = { error: "boom" };
    const spec = baseSpec({ model: { figure: PLOTLY_SAMPLE_FIGURE } });
    const result = await captureInteractionThumbnail(root, spec);
    expect(result.ok).toBe(false);
    expect(existsSync(interactionStore.interactionThumbnailPath(root, spec.id))).toBe(false);
  });

  it("success writes a real PNG thumbnail file", async () => {
    const spec = baseSpec({ model: { figure: PLOTLY_SAMPLE_FIGURE } });
    const result = await captureInteractionThumbnail(root, spec);
    expect(result.ok).toBe(true);
    expect(existsSync(interactionStore.interactionThumbnailPath(root, spec.id))).toBe(true);
  });

  it("captures a figure.script thumbnail via resolveScriptForThumbnail", async () => {
    const dir = join(root, ".prismnext", "artifacts", "demo.thumb.script");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "script.js"), SCRIPT_SAMPLE_JS, "utf8");

    const spec = baseSpec({
      id: "demo.thumb.script",
      kind: "figure.script",
      resources: [{ role: "script", path: "script.js" }],
    });
    const result = await captureInteractionThumbnail(root, spec);
    expect(result.ok).toBe(true);
    expect(existsSync(interactionStore.interactionThumbnailPath(root, spec.id))).toBe(true);
  });

  it("captures a diagram.mermaid thumbnail via resolveDiagramForThumbnail", async () => {
    const spec = baseSpec({
      id: "demo.thumb.diagram",
      kind: "diagram.mermaid",
      model: { source: "graph TD; A-->B;" },
    });
    const result = await captureInteractionThumbnail(root, spec);
    expect(result.ok).toBe(true);
    expect(existsSync(interactionStore.interactionThumbnailPath(root, spec.id))).toBe(true);
  });
});

describe("scheduleInteractionThumbnail (single-flight + side effects)", () => {
  let root: string;
  let fakeAppWindow: { isDestroyed: () => boolean; webContents: { send: ReturnType<typeof vi.fn> } };

  beforeEach(() => {
    mockWindows = [];
    nextExecuteJavaScriptResult = { ready: true };
    executeJavaScriptShouldHang = false;
    root = mkdtempSync(join(tmpdir(), "ix-thumb-schedule-"));
    fakeAppWindow = { isDestroyed: () => false, webContents: { send: vi.fn() } };
    mockAppWindows = [fakeAppWindow];
  });

  afterEach(() => {
    mockAppWindows = [];
    rmSync(root, { recursive: true, force: true });
    for (const f of readdirSync(thumbTempDir)) {
      if (f.endsWith(".html")) rmSync(join(thumbTempDir, f), { force: true });
    }
  });

  it("success path: clears any thumbnail last-error and broadcasts reason:thumbnail", async () => {
    const spec = baseSpec({ id: "demo.schedule.ok", model: { figure: PLOTLY_SAMPLE_FIGURE } });
    interactionStore.writeInteractionLastError(root, spec.id, {
      message: "stale from a prior failed capture",
      phase: "thumbnail",
    });

    await scheduleInteractionThumbnail(root, spec);

    expect(interactionStore.readInteractionLastError(root, spec.id)).toBeNull();
    expect(fakeAppWindow.webContents.send).toHaveBeenCalledWith(
      "interaction:changed",
      expect.objectContaining({ id: spec.id, reason: "thumbnail" }),
    );
  });

  it("failure path: writes a thumbnail-phase last-error and still broadcasts", async () => {
    nextExecuteJavaScriptResult = { error: "capture boom" };
    const spec = baseSpec({ id: "demo.schedule.fail", model: { figure: PLOTLY_SAMPLE_FIGURE } });

    await scheduleInteractionThumbnail(root, spec);

    const err = interactionStore.readInteractionLastError(root, spec.id);
    expect(err?.phase).toBe("thumbnail");
    expect(err?.message).toMatch(/capture boom/);
    expect(fakeAppWindow.webContents.send).toHaveBeenCalledWith(
      "interaction:changed",
      expect.objectContaining({ id: spec.id, reason: "thumbnail" }),
    );
  });

  it("single-flight: 3 synchronous calls for the same id collapse to 2 captures (initial + latest queued)", async () => {
    const id = "demo.schedule.singleflight";
    const specA = baseSpec({ id, title: "A", model: { figure: PLOTLY_SAMPLE_FIGURE } });
    const specB = baseSpec({ id, title: "B", model: { figure: PLOTLY_SAMPLE_FIGURE } });
    const specC = baseSpec({ id, title: "C", model: { figure: PLOTLY_SAMPLE_FIGURE } });

    const p1 = scheduleInteractionThumbnail(root, specA);
    const p2 = scheduleInteractionThumbnail(root, specB);
    const p3 = scheduleInteractionThumbnail(root, specC);

    // Only the first call should have started real work synchronously — the
    // second and third just replace the "pending" slot (latest wins).
    expect(mockWindows).toHaveLength(1);

    await Promise.all([p1, p2, p3]);

    // Exactly one replay for the latest queued spec (C) — never one per call.
    expect(mockWindows).toHaveLength(2);
  });
});
