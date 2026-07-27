import {
  resolveSceneIrView,
  type SceneIrModel,
} from "../../../../shared/interaction-scene-ir";
import type { SurfaceMeshData } from "../../../../shared/interaction-math";

export type SceneIrRenderPayload = {
  mesh: SurfaceMeshData;
  model: SceneIrModel;
  tangent: {
    pu: [number, number, number];
    pv: [number, number, number];
    p: [number, number, number];
  };
};

export type SceneIrHost = {
  setPayload: (payload: SceneIrRenderPayload) => void;
  syncTheme: (isDark: boolean) => void;
  dispose: () => void;
};

const VIEW_MIN = 32;

function measureContainer(container: HTMLElement): { width: number; height: number } {
  const width = Math.max(VIEW_MIN, Math.floor(container.clientWidth) || 640);
  const height = Math.max(VIEW_MIN, Math.floor(container.clientHeight) || 360);
  return { width, height };
}

function waitForLayoutSize(container: HTMLElement): Promise<{ width: number; height: number }> {
  const ready = () => container.clientWidth >= VIEW_MIN && container.clientHeight >= VIEW_MIN;
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
    window.setTimeout(finish, 600);
  });
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

function normalize(v: [number, number, number]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

export async function createSceneIrHost(
  container: HTMLElement,
  isDark: boolean,
): Promise<SceneIrHost> {
  container.replaceChildren();
  const THREE = await import("three");
  const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");

  const { width, height } = await waitForLayoutSize(container);
  if (!container.isConnected) throw new Error("scene.ir canvas unmounted before layout");

  let frameId = 0;
  let disposed = false;
  let dark = isDark;
  let lastPayload: SceneIrRenderPayload | null = null;
  let lastCameraKey = "";

  const scene3 = new THREE.Scene();
  scene3.background = new THREE.Color(isDark ? 0x1c1c1e : 0xffffff);

  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 200);
  const defaults = resolveSceneIrView();
  camera.position.set(...defaults.camera);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height, false);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0, 0);

  scene3.add(new THREE.AmbientLight(0xffffff, isDark ? 0.55 : 0.75));
  const dir = new THREE.DirectionalLight(0xffffff, isDark ? 0.85 : 0.9);
  dir.position.set(4, 6, 3);
  scene3.add(dir);

  const content = new THREE.Group();
  scene3.add(content);

  const clearContent = () => {
    for (const child of [...content.children]) {
      content.remove(child);
      disposeObject3D(child);
    }
    content.position.set(0, 0, 0);
  };

  const paint = (payload: SceneIrRenderPayload) => {
    clearContent();
    const { mesh, model, tangent } = payload;
    const layers = model.layers ?? {};
    const view = resolveSceneIrView(model.view);

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
    const colors = mesh.colors.slice();
    if (dark) {
      for (let i = 0; i < colors.length; i++) colors[i] = colors[i]! * 0.85;
    }
    geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geom.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    geom.computeVertexNormals();

    content.add(
      new THREE.Mesh(
        geom,
        new THREE.MeshLambertMaterial({
          vertexColors: true,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.92,
        }),
      ),
    );

    if (layers.wireframe !== false) {
      const wire = new THREE.LineSegments(
        new THREE.WireframeGeometry(geom),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.15 }),
      );
      content.add(wire);
    }

    // Default: keep mathematical (0,0,0). Opt-in bbox recentering via model.view.frame.
    let offsetX = 0;
    let offsetY = 0;
    let offsetZ = 0;
    if (view.frame === "bbox") {
      const box = new THREE.Box3().setFromObject(content);
      const center = box.getCenter(new THREE.Vector3());
      if (Number.isFinite(center.x) && Number.isFinite(center.y) && Number.isFinite(center.z)) {
        offsetX = center.x;
        offsetY = center.y;
        offsetZ = center.z;
        content.position.set(-offsetX, -offsetY, -offsetZ);
      }
    }

    const pLocal = new THREE.Vector3(
      tangent.p[0] - offsetX,
      tangent.p[1] - offsetY,
      tangent.p[2] - offsetZ,
    );

    content.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xff5577 }),
      )
        .translateX(pLocal.x)
        .translateY(pLocal.y)
        .translateZ(pLocal.z),
    );

    if (layers.tangent !== false) {
      const pu = normalize(tangent.pu);
      const pv = normalize(tangent.pv);
      const arrowLen = 0.45;
      content.add(
        new THREE.ArrowHelper(
          new THREE.Vector3(...pu),
          pLocal,
          arrowLen,
          0xff8855,
          0.1,
          0.06,
        ),
      );
      content.add(
        new THREE.ArrowHelper(
          new THREE.Vector3(...pv),
          pLocal,
          arrowLen,
          0x55ffaa,
          0.1,
          0.06,
        ),
      );
    }

    if (layers.axes) {
      // Child of content at local 0 → world math origin when frame=origin;
      // world AABB center when frame=bbox.
      content.add(new THREE.AxesHelper(view.axesSize));
    }

    const cameraKey = view.camera.join(",");
    if (cameraKey !== lastCameraKey) {
      camera.position.set(...view.camera);
      lastCameraKey = cameraKey;
    }

    if (view.orbitTarget === "probe") {
      controls.target.copy(pLocal);
    } else {
      controls.target.set(0, 0, 0);
    }
  };

  const loop = () => {
    if (disposed) return;
    controls.update();
    renderer.render(scene3, camera);
    frameId = requestAnimationFrame(loop);
  };
  loop();

  const ro = new ResizeObserver(() => {
    if (disposed || !container.isConnected) return;
    const next = measureContainer(container);
    camera.aspect = next.width / next.height;
    camera.updateProjectionMatrix();
    renderer.setSize(next.width, next.height, false);
  });
  ro.observe(container);

  return {
    setPayload(payload: SceneIrRenderPayload) {
      lastPayload = payload;
      paint(payload);
    },
    syncTheme(nextDark: boolean) {
      if (disposed) return;
      dark = nextDark;
      scene3.background = new THREE.Color(dark ? 0x1c1c1e : 0xffffff);
      if (lastPayload) paint(lastPayload);
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frameId);
      ro.disconnect();
      clearContent();
      try {
        (renderer as { forceContextLoss?: () => void }).forceContextLoss?.();
      } catch {
        /* ignore */
      }
      renderer.dispose();
      container.replaceChildren();
    },
  };
}
