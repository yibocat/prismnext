/**
 * Programmable Interaction canvas — host context (v0).
 * Scene modules only use this surface; no Node / arbitrary parent DOM.
 */

export type SceneSize = { width: number; height: number };

export type SceneTheme = {
  isDark: boolean;
  /** CSS color string sampled for canvas background */
  background: string;
  foreground: string;
};

export type SceneThreeHandle = {
  THREE: typeof import("three");
  scene: import("three").Scene;
  camera: import("three").PerspectiveCamera;
  renderer: import("three").WebGLRenderer & {
    forceContextLoss?: () => void;
  };
  /** OrbitControls instance */
  controls: {
    update: () => void;
    target: import("three").Vector3;
    enableDamping: boolean;
    dispose?: () => void;
  };
  content: import("three").Group;
  /** Apply Appearance card background */
  syncBackground: () => void;
  /**
   * Host DOM for HUD overlays (`position:absolute` children).
   * Same element as `ctx.el`. Canvas events use `renderer.domElement`.
   */
  root: HTMLElement;
  /** Alias of `root` — Agents often invent `handle.dom` for HUD parents. */
  dom: HTMLElement;
  /** Alias of `root`. */
  overlay: HTMLElement;
};

export type InteractionSceneCtx = {
  el: HTMLElement;
  bindings: Record<string, number>;
  onBindings: (cb: (next: Record<string, number>) => void) => () => void;
  size: SceneSize;
  onResize: (cb: (next: SceneSize) => void) => () => void;
  theme: SceneTheme;
  onTheme: (cb: (next: SceneTheme) => void) => () => void;
  /** Read text file relative to the artifact directory only. */
  resource: (relPath: string) => Promise<string>;
  three: {
    ensure: () => Promise<SceneThreeHandle>;
  };
  /** Host-owned status strip (no DOM from scene.js). Pass null to clear. */
  setStatus: (message: string | null) => void;
};

export type InteractionSceneModule = {
  mount: (
    ctx: InteractionSceneCtx,
  ) => void | (() => void) | Promise<void | (() => void)>;
  update?: (ctx: InteractionSceneCtx) => void | Promise<void>;
  dispose?: () => void;
};
