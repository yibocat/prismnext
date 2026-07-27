import {
  builtinSceneName,
  isBuiltinSceneEntry,
} from "../../../../shared/interaction-scene";
import {
  assertSceneSourceHardBans,
  isLegacyAgentSceneSource,
} from "../../../../shared/interaction-scene-contract";
import {
  isPageStyleSceneSource,
  normalizeSceneSourceForHost,
  sceneMountLooksLikeContainerArg,
} from "../../../../shared/interaction-scene-normalize";
import type { InteractionSceneModule } from "./scene-ctx";
import { createBuiltinLorenzScene } from "./builtin-lorenz";
import { wrapLegacyAgentMount } from "./legacy-agent-mount";

async function loadBuiltin(name: string): Promise<InteractionSceneModule> {
  if (name === "lorenz") return createBuiltinLorenzScene();
  throw new Error(`unknown builtin scene "${name}"`);
}

/**
 * Vite/Electron cannot `import(blob:…)` — the bundler intercepts dynamic import and fails.
 * Evaluate artifact scene.js in a CommonJS-like scope instead (no bare `import`).
 */
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

async function evaluateSceneSource(sourceText: string): Promise<InteractionSceneModule> {
  const { source: normalized } = normalizeSceneSourceForHost(sourceText);
  assertSceneSourceHardBans(normalized);

  const pageStyle = isPageStyleSceneSource(normalized);
  const legacyApi = isLegacyAgentSceneSource(normalized);
  // remappedInit alone must not force containerArg — `init(ctx)` with ensure stays official.
  const containerArg = sceneMountLooksLikeContainerArg(normalized);
  const useLegacy = pageStyle || legacyApi || containerArg;

  let THREE: unknown = null;
  let OrbitControls: unknown = null;
  if (useLegacy) {
    THREE = await import("three");
    ({ OrbitControls } = await import(
      "three/examples/jsm/controls/OrbitControls.js"
    ));
  }

  const rewritten = rewriteSceneSource(normalized);
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- intentional sandbox for artifact scene.js
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
  const result = factory(module, module.exports, THREE, OrbitControls);

  const mod = (result && typeof result === "object" ? result : module.exports) as {
    mount?: InteractionSceneModule["mount"];
    setup?: InteractionSceneModule["mount"];
    main?: InteractionSceneModule["mount"];
    init?: InteractionSceneModule["mount"];
    update?: InteractionSceneModule["update"];
    dispose?: InteractionSceneModule["dispose"];
  };

  const mountFn = mod.mount ?? mod.setup ?? mod.main ?? mod.init;
  if (typeof mountFn !== "function") {
    throw new Error(
      "scene module must export mount(ctx), setup(ctx), main(ctx), or init(container)",
    );
  }

  if (useLegacy) {
    console.warn(
      "[interaction scene] running legacy/page-style scene compat shim (canvas + THREE). Prefer await ctx.three.ensure() when writing new demos.",
    );
    return wrapLegacyAgentMount(
      mountFn as (ctx: Record<string, unknown>) => void | (() => void) | Promise<void | (() => void)>,
      mod.dispose,
      {
        containerArg,
        OrbitControls: OrbitControls as unknown,
      },
    );
  }

  let mountCleanup: (() => void) | undefined;
  return {
    async mount(ctx) {
      const ret = await mountFn(ctx);
      if (typeof ret === "function") mountCleanup = ret;
    },
    update: typeof mod.update === "function" ? mod.update : undefined,
    dispose() {
      try {
        mountCleanup?.();
      } catch {
        /* ignore */
      }
      mountCleanup = undefined;
      mod.dispose?.();
    },
  };
}

/**
 * Load a scene module from builtin:name or artifact scene source text.
 */
export async function loadSceneModule(
  entry: string,
  sourceText?: string,
): Promise<InteractionSceneModule> {
  if (isBuiltinSceneEntry(entry)) {
    const name = builtinSceneName(entry);
    if (!name) throw new Error("invalid builtin entry");
    return loadBuiltin(name);
  }

  if (!sourceText?.trim()) {
    throw new Error("scene entry source is empty");
  }

  return evaluateSceneSource(sourceText);
}
