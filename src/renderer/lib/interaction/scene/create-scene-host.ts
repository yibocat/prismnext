import type {
  InteractionSceneCtx,
  SceneSize,
  SceneTheme,
  SceneThreeHandle,
} from "./scene-ctx";
import { guardSceneCtx } from "./guard-scene-ctx";

const VIEW_MIN = 32;

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function readSceneTheme(isDark: boolean): SceneTheme {
  return {
    isDark,
    background: cssVar("--card", isDark ? "#1c1c1e" : "#ffffff"),
    foreground: cssVar("--foreground", isDark ? "#fafafa" : "#0a0a0a"),
  };
}

export function measureSceneEl(el: HTMLElement): SceneSize {
  return {
    width: Math.max(VIEW_MIN, Math.floor(el.clientWidth) || 640),
    height: Math.max(VIEW_MIN, Math.floor(el.clientHeight) || 360),
  };
}

function safeArtifactRel(relPath: string): string | null {
  const p = relPath.replace(/\\/g, "/").replace(/^\.\//, "").trim();
  if (!p || p.includes("..") || p.startsWith("/") || /^[A-Za-z]:/.test(p)) return null;
  return p;
}

export type SceneHostController = {
  ctx: InteractionSceneCtx;
  setBindings: (next: Record<string, number>) => void;
  setTheme: (isDark: boolean) => void;
  dispose: () => void;
};

export function createSceneHostController(opts: {
  el: HTMLElement;
  artifactDirAbs: string;
  initialBindings: Record<string, number>;
  isDark: boolean;
  onStatus?: (message: string | null) => void;
}): SceneHostController {
  const { el, artifactDirAbs, onStatus } = opts;
  let bindings = { ...opts.initialBindings };
  let theme = readSceneTheme(opts.isDark);
  let size = measureSceneEl(el);
  let disposed = false;
  let threeHandle: SceneThreeHandle | null = null;
  let frameId = 0;
  let ro: ResizeObserver | null = null;

  const bindingListeners = new Set<(next: Record<string, number>) => void>();
  const resizeListeners = new Set<(next: SceneSize) => void>();
  const themeListeners = new Set<(next: SceneTheme) => void>();

  const notifySize = () => {
    size = measureSceneEl(el);
    for (const cb of resizeListeners) cb(size);
    if (threeHandle) {
      const { camera, renderer } = threeHandle;
      camera.aspect = size.width / size.height;
      camera.updateProjectionMatrix();
      renderer.setSize(size.width, size.height, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
    }
  };

  ro = new ResizeObserver(() => {
    if (disposed || !el.isConnected) return;
    notifySize();
  });
  ro.observe(el);

  const ensureThree = async (): Promise<SceneThreeHandle> => {
    if (threeHandle) return threeHandle;
    const THREE = await import("three");
    const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");

    // Wait briefly for flex layout
    for (let i = 0; i < 12; i++) {
      const s = measureSceneEl(el);
      if (s.width >= VIEW_MIN && s.height >= VIEW_MIN) break;
      await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    }
    size = measureSceneEl(el);

    // HUD panels use position:absolute against the host (Agents append to handle.root/dom).
    if (!el.style.position || el.style.position === "static") {
      el.style.position = "relative";
    }
    el.replaceChildren();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(theme.background);

    const camera = new THREE.PerspectiveCamera(45, size.width / size.height, 0.1, 500);
    camera.position.set(0, 0, 50);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(size.width, size.height, false);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    el.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);

    const ambient = new THREE.AmbientLight(0xffffff, theme.isDark ? 0.55 : 0.75);
    scene.add(ambient);
    const directional = new THREE.DirectionalLight(0xffffff, theme.isDark ? 0.8 : 0.85);
    directional.position.set(4, 6, 3);
    scene.add(directional);

    const content = new THREE.Group();
    scene.add(content);

    const syncBackground = () => {
      scene.background = new THREE.Color(theme.background);
    };

    const loop = () => {
      if (disposed) return;
      controls.update();
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(loop);
    };
    loop();

    threeHandle = {
      THREE,
      scene,
      camera,
      renderer,
      controls,
      content,
      syncBackground,
      // Agents invent handle.root / handle.dom for HTML HUD overlays.
      root: el,
      dom: el,
      overlay: el,
    };
    return threeHandle;
  };

  const ctx: InteractionSceneCtx = {
    el,
    get bindings() {
      return bindings;
    },
    onBindings(cb) {
      bindingListeners.add(cb);
      return () => bindingListeners.delete(cb);
    },
    get size() {
      return size;
    },
    onResize(cb) {
      resizeListeners.add(cb);
      return () => resizeListeners.delete(cb);
    },
    get theme() {
      return theme;
    },
    onTheme(cb) {
      themeListeners.add(cb);
      return () => themeListeners.delete(cb);
    },
    async resource(relPath) {
      const safe = safeArtifactRel(relPath);
      if (!safe) throw new Error("invalid resource path");
      const abs = `${artifactDirAbs.replace(/\/$/, "")}/${safe}`;
      const res = await window.electronAPI.fsRead(abs);
      if (res.missing || typeof res.content !== "string") {
        throw new Error(`resource not found: ${safe}`);
      }
      return res.content;
    },
    three: {
      ensure: ensureThree,
    },
    setStatus(message) {
      onStatus?.(message == null ? null : String(message));
    },
  };

  return {
    ctx: guardSceneCtx(ctx),
    setBindings(next) {
      bindings = { ...next };
      for (const cb of bindingListeners) cb(bindings);
    },
    setTheme(isDark) {
      theme = readSceneTheme(isDark);
      threeHandle?.syncBackground();
      for (const cb of themeListeners) cb(theme);
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frameId);
      frameId = 0;
      ro?.disconnect();
      ro = null;
      bindingListeners.clear();
      resizeListeners.clear();
      themeListeners.clear();
      if (threeHandle) {
        try {
          threeHandle.controls.dispose?.();
        } catch {
          /* ignore */
        }
        try {
          threeHandle.renderer.forceContextLoss?.();
        } catch {
          /* ignore */
        }
        threeHandle.renderer.dispose();
        threeHandle = null;
      }
      el.replaceChildren();
    },
  };
}
