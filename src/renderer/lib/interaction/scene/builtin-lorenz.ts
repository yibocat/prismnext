/**
 * Optional stock Lorenz attractor — only when spec.entry is explicitly "builtin:lorenz".
 * Not a default, fallback, or substitute for other visualizations.
 */
import type { InteractionSceneCtx, InteractionSceneModule } from "./scene-ctx";

const TRAIL = 4000;
const DT = 0.005;
const STEPS_PER_FRAME = 6;

function step(
  state: { x: number; y: number; z: number },
  a: number,
  b: number,
  c: number,
  dt: number,
): void {
  const { x, y, z } = state;
  const dx = a * (y - x);
  const dy = x * (b - z) - y;
  const dz = x * y - c * z;
  state.x = x + dx * dt;
  state.y = y + dy * dt;
  state.z = z + dz * dt;
}

export function createBuiltinLorenzScene(): InteractionSceneModule {
  let cleanup: (() => void) | null = null;

  return {
    async mount(ctx: InteractionSceneCtx) {
      cleanup?.();
      const handle = await ctx.three.ensure();
      const { THREE, content, camera, controls } = handle;

      camera.position.set(0, 0, 55);
      controls.target.set(0, 0, 25);

      const positions = new Float32Array(TRAIL * 3);
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const material = new THREE.PointsMaterial({
        color: ctx.theme.isDark ? 0x7aa2f7 : 0x3b6fd9,
        size: 0.15,
        sizeAttenuation: true,
      });
      const points = new THREE.Points(geom, material);
      content.add(points);

      const state = { x: 0.1, y: 0, z: 0 };
      let write = 0;
      let filled = 0;
      let a = ctx.bindings.a ?? 10;
      let b = ctx.bindings.b ?? 28;
      let c = ctx.bindings.c ?? 8 / 3;
      let raf = 0;
      let disposed = false;

      const unsubBind = ctx.onBindings((next) => {
        a = next.a ?? a;
        b = next.b ?? b;
        c = next.c ?? c;
        // Restart trail when parameters jump so the attractor re-forms cleanly.
        write = 0;
        filled = 0;
        state.x = 0.1;
        state.y = 0;
        state.z = 0;
      });

      const unsubTheme = ctx.onTheme((t) => {
        material.color.setHex(t.isDark ? 0x7aa2f7 : 0x3b6fd9);
        handle.syncBackground();
      });

      const tick = () => {
        if (disposed) return;
        for (let i = 0; i < STEPS_PER_FRAME; i++) {
          step(state, a, b, c, DT);
          const i3 = write * 3;
          positions[i3] = state.x;
          positions[i3 + 1] = state.y;
          positions[i3 + 2] = state.z;
          write = (write + 1) % TRAIL;
          filled = Math.min(TRAIL, filled + 1);
        }
        geom.setDrawRange(0, filled);
        geom.attributes.position!.needsUpdate = true;
        raf = requestAnimationFrame(tick);
      };
      tick();

      cleanup = () => {
        disposed = true;
        cancelAnimationFrame(raf);
        unsubBind();
        unsubTheme();
        content.remove(points);
        geom.dispose();
        material.dispose();
      };
    },
    dispose() {
      cleanup?.();
      cleanup = null;
    },
  };
}
