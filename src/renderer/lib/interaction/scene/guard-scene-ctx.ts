import {
  SCENE_CTX_ALLOWED_KEYS,
  SCENE_THREE_ALLOWED_KEYS,
  sceneCtxUnknownKeyMessage,
  sceneThreeUnknownKeyMessage,
} from "../../../../shared/interaction-scene-contract";
import type { InteractionSceneCtx } from "./scene-ctx";

const CTX_ALLOWED = new Set<string>(SCENE_CTX_ALLOWED_KEYS);
const THREE_ALLOWED = new Set<string>(SCENE_THREE_ALLOWED_KEYS);

/**
 * Freeze the public surface: invented keys like ctx.canvas throw immediately
 * (including when destructured: `const { canvas } = ctx`).
 */
export function guardSceneCtx(ctx: InteractionSceneCtx): InteractionSceneCtx {
  const threeGuarded = new Proxy(ctx.three, {
    get(target, prop, receiver) {
      if (typeof prop === "symbol") return Reflect.get(target, prop, receiver);
      const key = String(prop);
      if (!THREE_ALLOWED.has(key)) {
        throw new Error(sceneThreeUnknownKeyMessage(key));
      }
      return Reflect.get(target, prop, receiver);
    },
    set() {
      throw new Error("[scene contract] ctx.three is read-only");
    },
    has(_t, prop) {
      return typeof prop === "string" && THREE_ALLOWED.has(prop);
    },
    ownKeys() {
      return [...SCENE_THREE_ALLOWED_KEYS];
    },
    getOwnPropertyDescriptor(target, prop) {
      if (typeof prop === "string" && THREE_ALLOWED.has(prop)) {
        return {
          configurable: true,
          enumerable: true,
          writable: false,
          value: Reflect.get(target, prop),
        };
      }
      return undefined;
    },
  });

  return new Proxy(ctx, {
    get(target, prop, receiver) {
      if (typeof prop === "symbol") return Reflect.get(target, prop, receiver);
      const key = String(prop);
      if (key === "three") return threeGuarded;
      if (!CTX_ALLOWED.has(key)) {
        throw new Error(sceneCtxUnknownKeyMessage(key));
      }
      return Reflect.get(target, prop, receiver);
    },
    set() {
      throw new Error("[scene contract] ctx is read-only");
    },
    has(_t, prop) {
      return typeof prop === "string" && CTX_ALLOWED.has(prop);
    },
    ownKeys() {
      return [...SCENE_CTX_ALLOWED_KEYS];
    },
    getOwnPropertyDescriptor(target, prop) {
      if (typeof prop === "string" && CTX_ALLOWED.has(prop)) {
        return {
          configurable: true,
          enumerable: true,
          get: () => Reflect.get(target, prop),
        };
      }
      return undefined;
    },
  });
}
