import { describe, expect, it } from "vitest";
import {
  isPageStyleSceneSource,
  normalizeSceneSourceForHost,
  sceneMountLooksLikeContainerArg,
} from "../../src/shared/interaction-scene-normalize";

describe("normalizeSceneSourceForHost", () => {
  it("strips three ESM imports and remaps init → mount", () => {
    const raw = `
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
export function init(container) {
  void THREE;
  void OrbitControls;
  void container;
}
`;
    const n = normalizeSceneSourceForHost(raw);
    expect(n.strippedImports).toBe(true);
    expect(n.remappedInit).toBe(true);
    expect(n.source).not.toMatch(/^\s*import\s/m);
    expect(n.source).toMatch(/export function mount\b/);
    expect(n.source).not.toMatch(/export function init\b/);
  });

  it("detects page-style WebGL without ensure", () => {
    expect(
      isPageStyleSceneSource(`
export function mount(container) {
  const r = new THREE.WebGLRenderer({ canvas: container });
  void r;
}
`),
    ).toBe(true);
    expect(
      isPageStyleSceneSource(`
export async function mount(ctx) {
  await ctx.three.ensure();
}
`),
    ).toBe(false);
  });

  it("detects container-arg mount signatures", () => {
    expect(
      sceneMountLooksLikeContainerArg(`export function mount(container) { void container; }`),
    ).toBe(true);
    expect(
      sceneMountLooksLikeContainerArg(`export function mount(ctx) { void ctx.bindings; }`),
    ).toBe(false);
  });

  it("wraps bare ctx body into export async function mount", () => {
    const n = normalizeSceneSourceForHost(`
const handle = await ctx.three.ensure();
const { THREE, content } = handle;
content.add(new THREE.Mesh());
ctx.setStatus("ok");
`);
    expect(n.wrappedBareBody).toBe(true);
    expect(n.source).toMatch(/export async function mount\(ctx\)/);
  });
});
