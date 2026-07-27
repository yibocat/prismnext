/**
 * Pure dry-run for scene.js: normalize + hard contract + export wiring (no DOM).
 */

import { assertSceneSourceHardBans } from "./interaction-scene-contract";
import { normalizeSceneSourceForHost } from "./interaction-scene-normalize";

function rewriteSceneSource(source: string): string {
  let s = source.replace(/^\uFEFF/, "");
  s = s.replace(/^\s*export\s+default\s+/gm, "module.exports.default = ");
  s = s.replace(
    /^\s*export\s+(async\s+)?function\s+([A-Za-z_$][\w$]*)/gm,
    (_m, asyncKw: string | undefined, name: string) =>
      `${asyncKw ?? ""}function ${name}`,
  );
  s = s.replace(
    /^\s*export\s+(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/gm,
    (_m, kind: string, name: string) => `${kind} ${name} =`,
  );
  const named = ["mount", "setup", "main", "init", "update", "dispose"] as const;
  const assign = named
    .map((n) => `if (typeof ${n} === "function") exports.${n} = ${n};`)
    .join("\n");
  return `${s}\n${assign}\n`;
}

export type SceneSourceDryRunResult =
  | { ok: true; entry: "mount" | "setup" | "main" | "init"; normalized: boolean }
  | { ok: false; error: string };

/**
 * Validate scene.js can load: normalize → hard bans → evaluate exports.
 * Does not call mount (no DOM).
 */
export function dryRunSceneSource(sourceText: string): SceneSourceDryRunResult {
  const text = typeof sourceText === "string" ? sourceText : "";
  if (!text.trim()) {
    return { ok: false, error: "[scene contract] sceneSource is empty" };
  }

  const { source: normalized, strippedImports, remappedInit, wrappedBareBody } =
    normalizeSceneSourceForHost(text);

  try {
    assertSceneSourceHardBans(normalized);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  try {
    const rewritten = rewriteSceneSource(normalized);
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- intentional dry-run sandbox
    const factory = new Function(
      "module",
      "exports",
      "THREE",
      "OrbitControls",
      `${rewritten}\n; return module.exports.default != null ? module.exports.default : module.exports;`,
    ) as (
      module: { exports: Record<string, unknown> },
      exports: Record<string, unknown>,
      THREE: unknown,
      OrbitControls: unknown,
    ) => unknown;

    const module = { exports: {} as Record<string, unknown> };
    const result = factory(module, module.exports, null, null);
    const mod = (result && typeof result === "object" ? result : module.exports) as {
      mount?: unknown;
      setup?: unknown;
      main?: unknown;
      init?: unknown;
    };

    if (typeof mod.mount === "function") {
      return {
        ok: true,
        entry: "mount",
        normalized: strippedImports || remappedInit || wrappedBareBody,
      };
    }
    if (typeof mod.setup === "function") {
      return {
        ok: true,
        entry: "setup",
        normalized: strippedImports || remappedInit || wrappedBareBody,
      };
    }
    if (typeof mod.main === "function") {
      return {
        ok: true,
        entry: "main",
        normalized: strippedImports || remappedInit || wrappedBareBody,
      };
    }
    if (typeof mod.init === "function") {
      return {
        ok: true,
        entry: "init",
        normalized: strippedImports || remappedInit || wrappedBareBody,
      };
    }
    return {
      ok: false,
      error:
        "[scene contract] scene.js evaluated but has no mount/setup/main/init export — check export syntax",
    };
  } catch (e) {
    return {
      ok: false,
      error: `[scene contract] scene.js failed to evaluate: ${
        e instanceof Error ? e.message : String(e)
      }`,
    };
  }
}
