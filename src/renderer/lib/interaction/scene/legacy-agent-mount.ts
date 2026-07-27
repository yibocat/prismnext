import type { InteractionSceneCtx, InteractionSceneModule } from "./scene-ctx";

type AgentMount = (
  ctx: Record<string, unknown>,
) => void | (() => void) | Promise<void | (() => void)>;

const VIEW_MIN = 32;

async function waitForCanvasLayout(el: HTMLElement): Promise<void> {
  for (let i = 0; i < 30; i++) {
    if (el.clientWidth >= VIEW_MIN && el.clientHeight >= VIEW_MIN) return;
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
  }
}

export type LegacyMountOptions = {
  /** Call user mount with the canvas element only (init(container) style). */
  containerArg?: boolean;
  /** Injected when Agent stripped `import { OrbitControls } from "three/…"`. */
  OrbitControls?: unknown;
};

/**
 * Bridge for Agent-authored scene.js written against a page-style / fictional API
 * (import three, init(container), ctx.canvas / ctx.THREE / ctx.params).
 */
export function wrapLegacyAgentMount(
  userMount: AgentMount,
  userDispose?: () => void,
  opts: LegacyMountOptions = {},
): InteractionSceneModule {
  let legacyCleanup: (() => void) | undefined;
  let canvas: HTMLCanvasElement | null = null;

  return {
    async mount(ctx: InteractionSceneCtx) {
      await waitForCanvasLayout(ctx.el);

      const THREE = await import("three");
      const orbitMod = opts.OrbitControls
        ? { OrbitControls: opts.OrbitControls }
        : await import("three/examples/jsm/controls/OrbitControls.js");

      canvas = document.createElement("canvas");
      canvas.style.display = "block";
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      ctx.el.replaceChildren(canvas);

      const legacyCtx: Record<string, unknown> = {
        canvas,
        THREE,
        OrbitControls: orbitMod.OrbitControls,
        params: { ...ctx.bindings },
        el: ctx.el,
        bindings: ctx.bindings,
        onBindings: ctx.onBindings,
        size: ctx.size,
        onResize: ctx.onResize,
        theme: ctx.theme,
        onTheme: ctx.onTheme,
        resource: ctx.resource,
      };

      const ret = opts.containerArg
        ? await (userMount as unknown as (el: HTMLElement) => ReturnType<AgentMount>)(
            canvas,
          )
        : await userMount(legacyCtx);
      if (typeof ret === "function") legacyCleanup = ret;
    },
    dispose() {
      try {
        legacyCleanup?.();
      } catch {
        /* ignore */
      }
      legacyCleanup = undefined;
      canvas?.remove();
      canvas = null;
      userDispose?.();
    },
  };
}
