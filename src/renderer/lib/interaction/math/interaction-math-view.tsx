import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { InteractionSpec } from "../../../../shared/interaction-spec";
import {
  buildMathScene,
  initialBindingValues,
  parseMathBindings,
} from "../../../../shared/interaction-math";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

function MathError({ message }: { message: string }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-md border border-border bg-muted px-4 py-5 text-center">
      <p className="text-[length:var(--font-size-13)] text-foreground">
        {t("interaction.panel.mathErrorTitle")}
      </p>
      <p className="mt-1 font-mono text-[length:var(--font-size-11)] text-muted-foreground">
        {message}
      </p>
    </div>
  );
}

function BindingSliders({
  spec,
  values,
  onChange,
}: {
  spec: InteractionSpec;
  values: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
}) {
  const bindings = useMemo(() => parseMathBindings(spec.bindings), [spec.bindings]);
  const keys = Object.keys(bindings);
  if (keys.length === 0) return null;

  return (
    <section className="space-y-4 rounded-md border border-border bg-card px-4 py-4">
      {keys.map((key) => {
        const b = bindings[key]!;
        const value = values[key] ?? b.default;
        return (
          <div key={key} className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-[length:var(--font-size-11)]">
              <span className="text-muted-foreground">{b.label}</span>
              <span className="tabular-nums text-foreground">{value.toFixed(3)}</span>
            </div>
            <Slider
              min={b.min}
              max={b.max}
              step={b.step}
              value={[value]}
              onValueChange={(v) => {
                onChange({ ...values, [key]: v[0] ?? b.default });
              }}
              aria-label={b.label}
            />
          </div>
        );
      })}
    </section>
  );
}

export function InteractionMathView({ spec }: { spec: InteractionSpec }) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const bindingDefs = useMemo(() => parseMathBindings(spec.bindings), [spec.bindings]);
  const [bindingValues, setBindingValues] = useState(() =>
    initialBindingValues(bindingDefs),
  );

  useEffect(() => {
    setBindingValues(initialBindingValues(bindingDefs));
  }, [spec.id, spec.revision, bindingDefs]);

  const scene = useMemo(
    () => buildMathScene(spec, bindingValues),
    [spec, bindingValues],
  );

  useEffect(() => {
    if (!scene.ok || !containerRef.current) return;

    let disposed = false;
    let frameId = 0;
    let renderer: import("three").WebGLRenderer | null = null;

    const node = containerRef.current;

    let resizeCleanup: (() => void) | undefined;

    void (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import(
        "three/examples/jsm/controls/OrbitControls.js"
      );
      if (disposed || !node) return;

      const width = Math.max(320, node.clientWidth || 640);
      const height = Math.min(440, Math.max(300, Math.round(width * 0.58)));

      const scene3 = new THREE.Scene();
      scene3.background = null;

      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
      camera.position.set(3.5, 2.8, 3.5);

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height);
      node.replaceChildren(renderer.domElement);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.target.set(0, 0, 0);

      scene3.add(new THREE.AmbientLight(0xffffff, 0.65));
      const dir = new THREE.DirectionalLight(0xffffff, 0.85);
      dir.position.set(4, 6, 3);
      scene3.add(dir);

      const content = new THREE.Group();
      scene3.add(content);

      if (scene.kind === "math.surface") {
        const geom = new THREE.BufferGeometry();
        geom.setAttribute("position", new THREE.BufferAttribute(scene.mesh.positions, 3));
        geom.setAttribute("color", new THREE.BufferAttribute(scene.mesh.colors, 3));
        geom.setIndex(new THREE.BufferAttribute(scene.mesh.indices, 1));
        geom.computeVertexNormals();
        const mat = new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.55,
          metalness: 0.05,
          side: THREE.DoubleSide,
        });
        content.add(new THREE.Mesh(geom, mat));
        const box = new THREE.Box3().setFromObject(content);
        const center = box.getCenter(new THREE.Vector3());
        content.position.sub(center);
        controls.target.copy(new THREE.Vector3(0, 0, 0));
      } else {
        const origin = new THREE.Group();
        for (const arrow of scene.arrows) {
          const dirVec = new THREE.Vector3(...arrow.direction);
          const len = dirVec.length();
          if (len < 1e-8) continue;
          const helper = new THREE.ArrowHelper(
            dirVec.normalize(),
            new THREE.Vector3(...arrow.origin),
            len,
            0x5b8def,
            0.08,
            0.05,
          );
          origin.add(helper);
        }
        content.add(origin);
        camera.position.set(0, 4.5, 4.5);
        controls.target.set(0, 0, 0);
      }

      scene3.add(new THREE.GridHelper(6, 12, 0x666666, 0x333333));

      const renderLoop = () => {
        if (disposed) return;
        controls.update();
        renderer!.render(scene3, camera);
        frameId = requestAnimationFrame(renderLoop);
      };
      renderLoop();

      const onResize = () => {
        if (!node || !renderer) return;
        const w = Math.max(320, node.clientWidth || width);
        const h = Math.min(440, Math.max(300, Math.round(w * 0.58)));
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      const ro = new ResizeObserver(onResize);
      ro.observe(node);
      resizeCleanup = () => ro.disconnect();
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      resizeCleanup?.();
      if (renderer) {
        renderer.dispose();
        renderer.domElement.remove();
      }
    };
  }, [scene]);

  if (!scene.ok) {
    return <MathError message={scene.error} />;
  }

  return (
    <div className="space-y-4">
      <BindingSliders spec={spec} values={bindingValues} onChange={setBindingValues} />
      <div
        ref={containerRef}
        className={cn(
          "w-full min-h-[300px] overflow-hidden rounded-md border border-border bg-card",
        )}
        aria-label={spec.title}
        role="img"
      />
      <p className="text-[length:var(--font-size-11)] text-muted-foreground">
        {t("interaction.panel.mathHint")}
      </p>
    </div>
  );
}
