import type { FieldArrow, SurfaceMeshData } from "../../../../shared/interaction-math";

export type MathScenePayload =
  | { kind: "math.surface"; mesh: SurfaceMeshData }
  | { kind: "math.field"; arrows: FieldArrow[] };

export type ThreeMathHost = {
  setScene: (scene: MathScenePayload) => void;
  /** Apply Appearance light/dark (and re-read --card after theme CSS settles). */
  syncTheme: (isDark: boolean) => void;
  dispose: () => void;
};

const VIEW_MIN = 32;

const THEME = {
  light: {
    fallbackBg: 0xffffff,
    gridPrimary: 0x888888,
    gridSecondary: 0xcccccc,
    ambient: 0.75,
    directional: 0.85,
    fieldArrow: 0x5b8def,
  },
  dark: {
    fallbackBg: 0x1c1c1e,
    gridPrimary: 0x6b7280,
    gridSecondary: 0x374151,
    ambient: 0.55,
    directional: 0.8,
    fieldArrow: 0x7aa2f7,
  },
} as const;

/** Same approach as `use-terminal-theme`: sample oklch/--token via 1×1 canvas. */
function cssColorToHex(cssColor: string, fallbackHex: number): number {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (!ctx || !cssColor) return fallbackHex;
    ctx.fillStyle = cssColor;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    if (a === 0) return fallbackHex;
    return (r! << 16) | (g! << 8) | b!;
  } catch {
    return fallbackHex;
  }
}

function readCardBackgroundHex(isDark: boolean): number {
  const token = getComputedStyle(document.documentElement)
    .getPropertyValue("--card")
    .trim();
  return cssColorToHex(token, isDark ? THEME.dark.fallbackBg : THEME.light.fallbackBg);
}

/** Read laid-out size only — do not write height/width (React flex owns that). */
function measureContainer(container: HTMLElement): { width: number; height: number } {
  const width = Math.max(VIEW_MIN, Math.floor(container.clientWidth) || 640);
  const height = Math.max(VIEW_MIN, Math.floor(container.clientHeight) || 360);
  return { width, height };
}

function disposeObject3D(obj: import("three").Object3D): void {
  obj.traverse((child) => {
    const mesh = child as unknown as {
      geometry?: { dispose: () => void };
      material?: { dispose: () => void } | Array<{ dispose: () => void }>;
    };
    mesh.geometry?.dispose();
    const mat = mesh.material;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose();
  });
}

function waitForLayoutSize(container: HTMLElement): Promise<{ width: number; height: number }> {
  const ready = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    return w >= VIEW_MIN && h >= VIEW_MIN;
  };

  if (ready()) return Promise.resolve(measureContainer(container));

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      ro.disconnect();
      resolve(measureContainer(container));
    };
    const ro = new ResizeObserver(() => {
      if (ready()) finish();
    });
    ro.observe(container);
    // RightArea expand animation — don't block forever.
    window.setTimeout(finish, 600);
  });
}

export async function createThreeMathHost(
  container: HTMLElement,
  isDark: boolean,
): Promise<ThreeMathHost> {
  container.replaceChildren();

  const THREE = await import("three");
  const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");

  // Wait until flex layout has a real box (opening RightArea often mounts at 0×0).
  const { width, height } = await waitForLayoutSize(container);
  if (!container.isConnected) {
    throw new Error("math canvas unmounted before layout");
  }

  let frameId = 0;
  let disposed = false;
  let dark = isDark;
  let lastScene: MathScenePayload | null = null;
  let lastKind: MathScenePayload["kind"] | null = null;
  let themeRaf = 0;
  const palette = () => (dark ? THEME.dark : THEME.light);

  const scene3 = new THREE.Scene();
  scene3.background = new THREE.Color(readCardBackgroundHex(dark));

  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
  camera.position.set(3.5, 2.8, 3.5);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  // updateStyle=false — CSS [&_canvas]:h-full/w-full owns display size; we only set the buffer.
  renderer.setSize(width, height, false);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0, 0);

  const ambient = new THREE.AmbientLight(0xffffff, palette().ambient);
  scene3.add(ambient);
  const directional = new THREE.DirectionalLight(0xffffff, palette().directional);
  directional.position.set(4, 6, 3);
  scene3.add(directional);

  const content = new THREE.Group();
  scene3.add(content);

  // GridHelper bakes colors into vertex attributes — recreate on theme change.
  let grid = new THREE.GridHelper(6, 12, palette().gridPrimary, palette().gridSecondary);
  scene3.add(grid);

  const applySize = () => {
    const next = measureContainer(container);
    camera.aspect = next.width / next.height;
    camera.updateProjectionMatrix();
    renderer.setSize(next.width, next.height, false);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
  };

  const renderLoop = () => {
    if (disposed) return;
    controls.update();
    renderer.render(scene3, camera);
    frameId = requestAnimationFrame(renderLoop);
  };
  renderLoop();

  const ro = new ResizeObserver(() => {
    if (!container.isConnected || disposed) return;
    applySize();
  });
  ro.observe(container);

  const clearContent = () => {
    for (const child of [...content.children]) {
      content.remove(child);
      disposeObject3D(child);
    }
    content.position.set(0, 0, 0);
  };

  const replaceGrid = () => {
    scene3.remove(grid);
    disposeObject3D(grid);
    grid = new THREE.GridHelper(6, 12, palette().gridPrimary, palette().gridSecondary);
    scene3.add(grid);
  };

  const paintScene = (scene: MathScenePayload) => {
    // Keep the user's orbit/zoom when only mesh data changes (bindings sliders).
    // Reset camera only when the scene kind changes (surface ↔ field) or first paint.
    const resetCamera = lastKind !== scene.kind;
    lastKind = scene.kind;
    clearContent();
    if (scene.kind === "math.surface") {
      mountSurface(THREE, content, scene, dark);
      if (resetCamera) {
        camera.position.set(3.5, 2.8, 3.5);
        controls.target.set(0, 0, 0);
      }
      return;
    }
    mountField(THREE, content, scene, palette().fieldArrow);
    if (resetCamera) {
      camera.position.set(0, 4.5, 4.5);
      controls.target.set(0, 0, 0);
    }
  };

  const applyThemeNow = () => {
    if (disposed) return;
    try {
      const p = palette();
      scene3.background = new THREE.Color(readCardBackgroundHex(dark));
      ambient.intensity = p.ambient;
      directional.intensity = p.directional;
      replaceGrid();
      if (lastScene) paintScene(lastScene);
    } catch (err) {
      console.error("[math-three-host] syncTheme failed:", err);
    }
  };

  return {
    setScene(scene: MathScenePayload) {
      lastScene = scene;
      applySize();
      paintScene(scene);
    },
    syncTheme(nextDark: boolean) {
      if (disposed) return;
      dark = nextDark;
      // Appearance / next-themes applies `.dark` + CSS vars on the next frame.
      cancelAnimationFrame(themeRaf);
      themeRaf = requestAnimationFrame(() => {
        themeRaf = requestAnimationFrame(applyThemeNow);
      });
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frameId);
      cancelAnimationFrame(themeRaf);
      ro.disconnect();
      clearContent();
      disposeObject3D(grid);
      renderer.dispose();
      container.replaceChildren();
    },
  };
}

function mountSurface(
  THREE: typeof import("three"),
  content: import("three").Group,
  scene: Extract<MathScenePayload, { kind: "math.surface" }>,
  isDark: boolean,
): void {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(scene.mesh.positions, 3));

  const colors = scene.mesh.colors.slice();
  if (isDark) {
    for (let i = 0; i < colors.length; i++) {
      colors[i] = colors[i]! * 0.85;
    }
  }
  geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geom.setIndex(new THREE.BufferAttribute(scene.mesh.indices, 1));
  geom.computeVertexNormals();

  // Lambert: needs lights but stays visible without an environment map (unlike high-metal Standard).
  content.add(
    new THREE.Mesh(
      geom,
      new THREE.MeshLambertMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
      }),
    ),
  );
  const box = new THREE.Box3().setFromObject(content);
  const center = box.getCenter(new THREE.Vector3());
  if (Number.isFinite(center.x) && Number.isFinite(center.y) && Number.isFinite(center.z)) {
    content.position.sub(center);
  }
}

function mountField(
  THREE: typeof import("three"),
  content: import("three").Group,
  scene: Extract<MathScenePayload, { kind: "math.field" }>,
  arrowColor: number,
): void {
  for (const arrow of scene.arrows) {
    const dirVec = new THREE.Vector3(...arrow.direction);
    const len = dirVec.length();
    if (len < 1e-8) continue;
    content.add(
      new THREE.ArrowHelper(
        dirVec.normalize(),
        new THREE.Vector3(...arrow.origin),
        len,
        arrowColor,
        0.08,
        0.05,
      ),
    );
  }
}
