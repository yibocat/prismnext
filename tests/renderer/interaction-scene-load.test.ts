import { describe, expect, it } from "vitest";
import {
  assertSceneSourceHardBans,
  isLegacyAgentSceneSource,
  SCENE_PROGRAM_SAMPLE,
} from "../../src/shared/interaction-scene-contract";
import { loadSceneModule } from "../../src/renderer/lib/interaction/scene/load-scene-module";
import { guardSceneCtx } from "../../src/renderer/lib/interaction/scene/guard-scene-ctx";
import type { InteractionSceneCtx } from "../../src/renderer/lib/interaction/scene/scene-ctx";

function stubCtx(): InteractionSceneCtx {
  return {
    el: document.createElement("div"),
    bindings: { a: 1 },
    onBindings: () => () => {},
    size: { width: 100, height: 100 },
    onResize: () => () => {},
    theme: { isDark: false, background: "#fff", foreground: "#000" },
    onTheme: () => () => {},
    resource: async () => "",
    three: { ensure: async () => { throw new Error("unused"); } },
    setStatus: () => {},
  };
}

describe("scene source contract", () => {
  it("allows the official sample (not legacy)", () => {
    expect(() => assertSceneSourceHardBans(SCENE_PROGRAM_SAMPLE)).not.toThrow();
    expect(isLegacyAgentSceneSource(SCENE_PROGRAM_SAMPLE)).toBe(false);
    expect(SCENE_PROGRAM_SAMPLE).toMatch(/setStatus/);
  });

  it("rejects ensure-as-THREE assign and invented ctx.scene/onChange", () => {
    expect(() =>
      assertSceneSourceHardBans(`
export async function mount(ctx) {
  const THREE = await ctx.three.ensure();
  void THREE;
}
`),
    ).toThrow(/handle, not THREE|ensure\(\) returns/);
    expect(() =>
      assertSceneSourceHardBans(`
export async function mount(ctx) {
  await ctx.three.ensure();
  ctx.scene.add(1);
}
`),
    ).toThrow(/ctx\.scene/);
    expect(() =>
      assertSceneSourceHardBans(`
export async function mount(ctx) {
  await ctx.three.ensure();
  ctx.onChange(() => {});
}
`),
    ).toThrow(/onBindings/);
  });

  it("hard-rejects DOM HUD construction", () => {
    expect(() =>
      assertSceneSourceHardBans(`
export async function mount(ctx) {
  const handle = await ctx.three.ensure();
  const root = handle.root;
  const panel = document.createElement("div");
  root.appendChild(panel);
}
`),
    ).toThrow(/createElement|DOM UI|append/);
  });

  it("flags invented ctx APIs as legacy (compat path)", () => {
    const src = `export function mount(ctx) { const { canvas, params, THREE } = ctx; }`;
    expect(() => assertSceneSourceHardBans(src)).not.toThrow();
    expect(isLegacyAgentSceneSource(src)).toBe(true);
  });

  it("hard-rejects bare import without normalize (contract layer)", () => {
    expect(() =>
      assertSceneSourceHardBans(`import * as THREE from "three";\nexport function mount() {}`),
    ).toThrow(/ctx\.three\.ensure/);
    expect(() =>
      assertSceneSourceHardBans(`import * as THREE from "three";\nexport function mount() {}`),
    ).toThrow(/cannot use import/);
    try {
      assertSceneSourceHardBans(`import * as THREE from "three";\nexport function mount() {}`);
    } catch (e) {
      expect(String(e)).not.toMatch(/lorenz/i);
    }
  });

  it("soft-loads three import + init(container) via normalize", async () => {
    const mod = await loadSceneModule(
      "scene.js",
      `
import * as THREE from "three";
export function init(container) {
  if (!container || !THREE) throw new Error("missing container/THREE");
  container.dataset.ok = "1";
}
`,
    );
    const el = document.createElement("div");
    Object.defineProperty(el, "clientWidth", { get: () => 100 });
    Object.defineProperty(el, "clientHeight", { get: () => 100 });
    await mod.mount(guardSceneCtx({ ...stubCtx(), el }));
    const canvas = el.querySelector("canvas");
    expect(canvas?.dataset.ok).toBe("1");
    mod.dispose?.();
  });

  it("does not treat comment mentions as legacy", () => {
    const src = `
// Restricted API: only ctx.el, ctx.bindings, ctx.three.ensure. No imports, no ctx.canvas/THREE/params.
export async function setup(ctx) {
  const handle = await ctx.three.ensure();
  const { THREE, content } = handle;
  content.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshBasicMaterial()));
}
`;
    expect(isLegacyAgentSceneSource(src)).toBe(false);
    expect(() => assertSceneSourceHardBans(src)).not.toThrow();
  });

  it("rejects ensure().then((THREE) and WebGLRenderer with ensure", () => {
    expect(() =>
      assertSceneSourceHardBans(`
export function setup(ctx) {
  return ctx.three.ensure().then((THREE) => {
    const r = new THREE.WebGLRenderer();
    void r;
  });
}
`),
    ).toThrow(/handle|WebGLRenderer|ensure/);
  });
});

describe("guardSceneCtx", () => {
  it("throws on unknown keys including destructuring", () => {
    const ctx = guardSceneCtx(stubCtx());
    expect(ctx.el).toBeTruthy();
    expect(ctx.bindings.a).toBe(1);
    expect(() => (ctx as unknown as { canvas: unknown }).canvas).toThrow(/ctx\.canvas/);
  });
});

describe("loadSceneModule", () => {
  it("loads builtin lorenz", async () => {
    const mod = await loadSceneModule("builtin:lorenz");
    expect(typeof mod.mount).toBe("function");
  });

  it("evaluates legal export function mount", async () => {
    const mod = await loadSceneModule(
      "scene.js",
      `
export function mount(ctx) {
  ctx.el.textContent = "ok:" + (ctx.bindings.a ?? 0);
}
export function dispose() {}
`,
    );
    const el = document.createElement("div");
    await mod.mount(guardSceneCtx({ ...stubCtx(), el, bindings: { a: 3 } }));
    expect(el.textContent).toBe("ok:3");
    mod.dispose?.();
  });

  it("evaluates export async function setup as mount", async () => {
    const mod = await loadSceneModule(
      "scene.js",
      `
export async function setup(ctx) {
  ctx.el.textContent = "setup-ok";
}
`,
    );
    const el = document.createElement("div");
    await mod.mount(guardSceneCtx({ ...stubCtx(), el }));
    expect(el.textContent).toBe("setup-ok");
  });

  it("evaluates export async function main as mount", async () => {
    const mod = await loadSceneModule(
      "scene.js",
      `
export async function main(ctx) {
  ctx.el.textContent = "main-ok";
}
`,
    );
    const el = document.createElement("div");
    await mod.mount(guardSceneCtx({ ...stubCtx(), el }));
    expect(el.textContent).toBe("main-ok");
  });

  it("rejects invented ctx.mount / ctx.frame host APIs", () => {
    expect(() =>
      assertSceneSourceHardBans(`
export async function mount(ctx) {
  ctx.mount(document.createElement("canvas"));
  ctx.frame(() => {});
}
`),
    ).toThrow(/ctx\.mount|ctx\.frame|host API/);
  });

  it("requires mount, setup, or main export", () => {
    expect(() =>
      assertSceneSourceHardBans(`
export async function render(ctx) {
  await ctx.three.ensure();
}
`),
    ).toThrow(/mount\(ctx\)|setup\(ctx\)|main\(ctx\)/);
  });

  it("loads legacy Agent scene.js via compat shim (does not throw contract error)", async () => {
    const mod = await loadSceneModule(
      "scene.js",
      `export function mount(ctx) {
  const { canvas, params } = ctx;
  const THREE = ctx.THREE;
  if (!canvas || !THREE || !params) throw new Error("missing legacy ctx");
  // do not construct renderer here — unit test only checks mount wiring
}
`,
    );
    expect(typeof mod.mount).toBe("function");
  });
});

