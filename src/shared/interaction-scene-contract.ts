/**
 * Hard contract for scene.program — static bans + allowed ctx keys.
 * Soft constraints live in prompts; this module is enforced in code.
 *
 * Legacy ctx.canvas / ctx.THREE / ctx.params get a runtime compat shim.
 * import/require, invented host loops, and ensure()-misuse remain hard-rejected.
 */

export const SCENE_CTX_ALLOWED_KEYS = [
  "el",
  "bindings",
  "onBindings",
  "size",
  "onResize",
  "theme",
  "onTheme",
  "resource",
  "three",
  "setStatus",
] as const;

export type SceneCtxAllowedKey = (typeof SCENE_CTX_ALLOWED_KEYS)[number];

export const SCENE_THREE_ALLOWED_KEYS = ["ensure"] as const;

/**
 * Legal scene.js shape for agents.
 * Host already owns renderer / camera / orbit controls / render loop —
 * just `await ctx.three.ensure()` and add meshes to `content`.
 */
export const SCENE_PROGRAM_SAMPLE = `export async function mount(ctx) {
  const handle = await ctx.three.ensure();
  const { THREE, content, camera, controls } = handle;
  camera.position.set(2.5, 2, 3.5);
  controls.target.set(0, 0, 0);

  const geom = new THREE.BoxGeometry(1, 1, 1);
  content.add(new THREE.Mesh(geom, new THREE.MeshNormalMaterial()));
  content.add(
    new THREE.LineSegments(
      new THREE.EdgesGeometry(geom),
      new THREE.LineBasicMaterial({ color: 0x111111 }),
    ),
  );

  // Knobs: read ctx.bindings / ctx.onBindings (define them in spec.bindings).
  // Status text: ctx.setStatus("…") — host shows it. Never build DOM UI here.
  ctx.setStatus("cube");
  ctx.onBindings((b) => {
    ctx.setStatus("a=" + (b.a ?? 0));
  });
}
`;

type BanRule = { id: string; re: RegExp; message: string };

/** Strip line and block comments so bans/legacy checks ignore prose. */
export function stripJsCommentsForContract(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:\\])\/\/.*$/gm, "$1");
}

/** Always rejected — cannot shim. */
const HARD_BAN_RULES: BanRule[] = [
  {
    id: "import",
    re: /^\s*import\s/m,
    message:
      "scene.js cannot use import. Get Three.js via: const handle = await ctx.three.ensure(); then use handle.THREE / handle.content / handle.camera / handle.controls.",
  },
  {
    id: "require",
    re: /\brequire\s*\(/,
    message: "scene.js cannot use require(). Use await ctx.three.ensure() for Three.js.",
  },
  {
    id: "invented-host",
    re: /\bctx\.(mount|resize|frame|render|loop)\b/,
    message:
      "scene.js invented host API (ctx.mount/resize/frame/…). Use await ctx.three.ensure() and handle.content / handle.camera / handle.controls; resize via ctx.onResize.",
  },
  {
    id: "ctx.three.THREE",
    re: /\bctx\.three\.THREE\b/,
    message:
      "Use const handle = await ctx.three.ensure(); then handle.THREE — not ctx.three.THREE.",
  },
  {
    id: "ensure-as-THREE",
    re: /\.ensure\s*\(\s*\)\s*\.then\s*\(\s*\(?\s*THREE\b/,
    message:
      "ctx.three.ensure() returns a handle, not THREE. Use: const handle = await ctx.three.ensure(); const { THREE, content } = handle;",
  },
  {
    id: "self-webgl-with-ensure",
    re: /\bnew\s+(?:\w+\.)?WebGLRenderer\b/,
    message:
      "Do not create WebGLRenderer when using ctx.three.ensure() — the host already owns the renderer. Add meshes to handle.content only.",
    /** Only apply when official ensure API is used (see assert below). */
  },
  {
    id: "dom-create",
    re: /\bdocument\.createElement\b|\bcreateElement\s*\(/,
    message:
      "scene.js cannot build DOM UI (createElement). Put knobs in spec.bindings; show text via ctx.setStatus(…). Prefer math.surface for formula surfaces.",
  },
  {
    id: "dom-innerhtml",
    re: /\.innerHTML\s*=/,
    message:
      "scene.js cannot set innerHTML. Use ctx.setStatus(…) for readouts and spec.bindings for knobs.",
  },
  {
    id: "dom-append-hud",
    re: /\b(?:handle\.(?:root|dom|overlay)|ctx\.el)\.appendChild\b/,
    message:
      "scene.js cannot append HUD nodes to handle.root/dom or ctx.el. Use spec.bindings + ctx.setStatus only.",
  },
  {
    id: "ensure-as-THREE-assign",
    re: /\b(?:const|let|var)\s+THREE\s*=\s*await\s+ctx\.three\.ensure\s*\(/,
    message:
      "ctx.three.ensure() returns a handle, not THREE. Use: const handle = await ctx.three.ensure(); const { THREE, content, camera, controls } = handle;",
  },
  {
    id: "ctx.scene",
    re: /\bctx\.scene\b/,
    message:
      "ctx.scene is not supported. Use const handle = await ctx.three.ensure(); then handle.content (add meshes there).",
  },
  {
    id: "ctx.onChange",
    re: /\bctx\.onChange\b/,
    message:
      "ctx.onChange is not supported. Use ctx.onBindings((b) => { … }) and read ctx.bindings.",
  },
  {
    id: "ctx.spec",
    re: /\bctx\.spec\b/,
    message:
      "ctx.spec is not supported. Put knobs in spec.bindings and read ctx.bindings / ctx.onBindings.",
  },
];

/** Invented Agent API — load via legacy compat shim instead of failing. */
const LEGACY_API_RULES: BanRule[] = [
  { id: "ctx.canvas", re: /\bctx\.canvas\b/, message: "ctx.canvas" },
  { id: "ctx.THREE", re: /\bctx\.THREE\b/, message: "ctx.THREE" },
  { id: "ctx.params", re: /\bctx\.params\b/, message: "ctx.params" },
  {
    id: "destructure-canvas",
    re: /\{\s*[^}]*\bcanvas\b[^}]*\}\s*=\s*ctx\b/,
    message: "destructure canvas",
  },
  {
    id: "destructure-THREE",
    re: /\{\s*[^}]*\bTHREE\b[^}]*\}\s*=\s*ctx\b/,
    message: "destructure THREE",
  },
  {
    id: "destructure-params",
    re: /\{\s*[^}]*\bparams\b[^}]*\}\s*=\s*ctx\b/,
    message: "destructure params",
  },
];

const ENTRY_EXPORT_RE =
  /\bexport\s+(?:async\s+)?function\s+(mount|setup|main|init)\b|\bexport\s+(?:const|let|var)\s+(mount|setup|main|init)\s*=|\bexports\.(mount|setup|main|init)\s*=|\bmodule\.exports\.(mount|setup|main|init)\s*=/;

export function hasSceneEntryExport(source: string): boolean {
  return ENTRY_EXPORT_RE.test(stripJsCommentsForContract(source.replace(/^\uFEFF/, "")));
}

const USES_ENSURE_RE = /\bctx\.three\.ensure\s*\(/;

export function assertSceneSourceHardBans(source: string): void {
  const text = stripJsCommentsForContract(source.replace(/^\uFEFF/, ""));
  for (const rule of HARD_BAN_RULES) {
    if (rule.id === "self-webgl-with-ensure") {
      if (USES_ENSURE_RE.test(text) && rule.re.test(text)) {
        throw new Error(`[scene contract] ${rule.message}`);
      }
      continue;
    }
    // Page-style scenes may still mention WebGLRenderer after import strip — allowed via legacy shim.
    if (rule.id === "import" || rule.id === "require") {
      if (rule.re.test(text)) {
        throw new Error(`[scene contract] ${rule.message}`);
      }
      continue;
    }
    if (rule.re.test(text)) {
      throw new Error(`[scene contract] ${rule.message}`);
    }
  }
  if (!ENTRY_EXPORT_RE.test(text)) {
    throw new Error(
      "[scene contract] scene.js must export mount(ctx), setup(ctx), main(ctx), or init(container). " +
        "Do not write a bare script body — wrap: export async function mount(ctx) { … }. " +
        "Prefer the legal sample from interaction-write. For formula surfaces prefer math.surface (no scene.js).",
    );
  }
}

/** @deprecated use assertSceneSourceHardBans + isLegacyAgentSceneSource */
export function assertSceneSourceAllowed(source: string): void {
  assertSceneSourceHardBans(source);
  if (isLegacyAgentSceneSource(source)) {
    throw new Error(
      "[scene contract] ctx.THREE / ctx.canvas / ctx.params are not on the host API. Prefer await ctx.three.ensure(); legacy shims may still run this file.",
    );
  }
}

export function isLegacyAgentSceneSource(source: string): boolean {
  const text = stripJsCommentsForContract(source.replace(/^\uFEFF/, ""));
  // Official ensure API wins — never route to the canvas shim.
  if (USES_ENSURE_RE.test(text)) return false;
  return LEGACY_API_RULES.some((rule) => rule.re.test(text));
}

export function sceneCtxUnknownKeyMessage(key: string): string {
  const allowed = SCENE_CTX_ALLOWED_KEYS.join(", ");
  return (
    `[scene contract] ctx.${key} is not supported. Allowed: ${allowed}. ` +
    `For Three.js: const handle = await ctx.three.ensure(); then use handle.THREE / handle.content. ` +
    `Do not invent ctx.canvas, ctx.THREE, or ctx.params.`
  );
}

export function sceneThreeUnknownKeyMessage(key: string): string {
  return (
    `[scene contract] ctx.three.${key} is not supported. Only ctx.three.ensure() is available.`
  );
}

/** Merge numeric spec.params into binding defaults for legacy scene.js that reads ctx.params. */
export function numericParamsAsBindings(
  params?: Record<string, unknown>,
): Record<string, number> {
  if (!params) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}
