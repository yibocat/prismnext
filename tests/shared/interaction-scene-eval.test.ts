import { describe, expect, it } from "vitest";
import {
  interactionArtifactsWriteDeniedMessage,
  isInteractionArtifactsPath,
  isInteractionManagedArtifactPath,
} from "../../src/shared/interaction-artifacts-path";
import { dryRunSceneSource } from "../../src/shared/interaction-scene-eval";
import { SCENE_PROGRAM_SAMPLE } from "../../src/shared/interaction-scene-contract";

describe("interaction artifact paths", () => {
  it("detects any path under artifacts/", () => {
    expect(isInteractionArtifactsPath(".prismnext/artifacts/scene.cube/scene.js")).toBe(true);
    expect(isInteractionArtifactsPath(".prismnext/artifacts/a/data/x.csv")).toBe(true);
    expect(isInteractionArtifactsPath(".prismnext/agent/skills/x/SKILL.md")).toBe(false);
  });

  it("only manages spec.json and root scene scripts", () => {
    expect(isInteractionManagedArtifactPath(".prismnext/artifacts/a/spec.json")).toBe(true);
    expect(isInteractionManagedArtifactPath(".prismnext/artifacts/a/scene.js")).toBe(true);
    expect(isInteractionManagedArtifactPath("/Users/x/proj/.prismnext/artifacts/a/main.mjs")).toBe(
      true,
    );
    expect(isInteractionManagedArtifactPath("C:\\proj\\.prismnext\\artifacts\\a\\scene.js")).toBe(
      true,
    );
    // Sidecars / nested resources — allowed via generic write
    expect(isInteractionManagedArtifactPath(".prismnext/artifacts/a/data/x.csv")).toBe(false);
    expect(isInteractionManagedArtifactPath(".prismnext/artifacts/a/assets/tex.png")).toBe(false);
    expect(isInteractionManagedArtifactPath(".prismnext/artifacts/a/lib/helper.js")).toBe(false);
    expect(isInteractionManagedArtifactPath("src/main/foo.ts")).toBe(false);
  });

  it("builds a clear deny message", () => {
    expect(interactionArtifactsWriteDeniedMessage(".prismnext/artifacts/x/scene.js")).toMatch(
      /interaction-write/,
    );
  });
});

describe("dryRunSceneSource", () => {
  it("accepts the official sample", () => {
    const r = dryRunSceneSource(SCENE_PROGRAM_SAMPLE);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.entry).toBe("mount");
  });

  it("soft-accepts three imports after normalize; rejects other imports", () => {
    const soft = dryRunSceneSource(
      `import * as THREE from "three";\nexport function mount(ctx) { void THREE; void ctx; }`,
    );
    expect(soft.ok).toBe(true);
    if (soft.ok) expect(soft.normalized).toBe(true);

    expect(
      dryRunSceneSource(`import foo from "not-three";\nexport function mount() {}`).ok,
    ).toBe(false);
  });

  it("rejects DOM HUD and ensure-as-THREE", () => {
    expect(
      dryRunSceneSource(`
export async function mount(ctx) {
  const handle = await ctx.three.ensure();
  document.createElement("div");
}
`).ok,
    ).toBe(false);
    expect(
      dryRunSceneSource(`
export function setup(ctx) {
  return ctx.three.ensure().then((THREE) => { new THREE.WebGLRenderer(); });
}
`).ok,
    ).toBe(false);
  });

  it("accepts setup, main, and remapped init exports", () => {
    expect(
      dryRunSceneSource(`export async function setup(ctx) { await ctx.three.ensure(); }`).ok,
    ).toBe(true);
    expect(
      dryRunSceneSource(`export async function main(ctx) { await ctx.three.ensure(); }`).ok,
    ).toBe(true);
    const init = dryRunSceneSource(
      `export async function init(ctx) { await ctx.three.ensure(); }`,
    );
    expect(init.ok).toBe(true);
    if (init.ok) {
      expect(init.entry).toBe("mount");
      expect(init.normalized).toBe(true);
    }
  });
});
