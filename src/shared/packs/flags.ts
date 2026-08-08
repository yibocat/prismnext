/**
 * Build-time gate for the Agent Pack (v2) architecture — Phase 0 of
 * docs-private/specs/2026-08-08-agent-pack-architecture-refactor.md.
 *
 * `__PRISM_PACKS_V2__` is baked by electron.vite.config.ts (main + renderer)
 * and vitest.config.ts from the `PRISM_PACKS_V2=1` env var. Default OFF so
 * 0.6.x releases ship no plugins entry points while the rebuild proceeds.
 */
declare const __PRISM_PACKS_V2__: boolean | undefined;

export const PACKS_V2_ENABLED: boolean =
  typeof __PRISM_PACKS_V2__ !== "undefined" && __PRISM_PACKS_V2__ === true;
