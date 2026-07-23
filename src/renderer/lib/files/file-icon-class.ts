// ─── Extension → Material Icon Theme (Iconify) mapping ───
// Prefix: "material-icon-theme:"

const ICON_MAP: Record<string, string> = {
  // ── LaTeX ──
  ".tex": "material-icon-theme:tex",
  ".ltx": "material-icon-theme:tex",
  ".sty": "material-icon-theme:tex",
  ".cls": "material-icon-theme:tex",
  ".bst": "material-icon-theme:bibtex-style",

  // ── Markdown ──
  ".md": "material-icon-theme:markdown",
  ".mdx": "material-icon-theme:markdown",

  // ── Data / Config ──
  ".json": "material-icon-theme:json",
  ".yaml": "material-icon-theme:yaml",
  ".yml": "material-icon-theme:yaml",
  ".toml": "material-icon-theme:settings",

  // ── JavaScript / TypeScript ──
  ".js": "material-icon-theme:javascript",
  ".jsx": "material-icon-theme:javascript",
  ".mjs": "material-icon-theme:javascript",
  ".cjs": "material-icon-theme:javascript",
  ".ts": "material-icon-theme:typescript",
  ".tsx": "material-icon-theme:typescript",
  ".mts": "material-icon-theme:typescript",
  ".cts": "material-icon-theme:typescript",

  // ── CSS ──
  ".css": "material-icon-theme:css",

  // ── HTML ──
  ".html": "material-icon-theme:html",
  ".htm": "material-icon-theme:html",

  // ── Python ──
  ".py": "material-icon-theme:python",
  ".pyw": "material-icon-theme:python",

  // ── Shell ──
  ".sh": "material-icon-theme:console",
  ".bash": "material-icon-theme:console",
  ".zsh": "material-icon-theme:console",

  // ── XML / SVG ──
  ".xml": "material-icon-theme:xml",
  ".svg": "material-icon-theme:svg",

  // ── BibTeX ──
  ".bib": "material-icon-theme:bibliography",

  // ── Docker ──
  "Dockerfile": "material-icon-theme:docker",
  "docker-compose.yml": "material-icon-theme:docker",

  // ── Extensionless files ──
  "Makefile": "material-icon-theme:settings",
  "LICENSE": "material-icon-theme:license",
  "README": "material-icon-theme:markdown",

  // ── Package ──
  "package.json": "material-icon-theme:npm",

  // ── Images ──
  ".png": "material-icon-theme:image",
  ".jpg": "material-icon-theme:image",
  ".jpeg": "material-icon-theme:image",
  ".gif": "material-icon-theme:image",
  ".webp": "material-icon-theme:image",
  ".bmp": "material-icon-theme:image",
  ".ico": "material-icon-theme:image",

  // ── PDF ──
  ".pdf": "material-icon-theme:pdf",

  // ── Default ──
  "": "material-icon-theme:document",
};

/** Get the Iconify icon name for a filename. Returns "material-icon-theme:xxx" */
export function getFileIconName(filename: string): string {
  const exact = ICON_MAP[filename];
  if (exact) return exact;
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return ICON_MAP[ext] ?? ICON_MAP[""];
}

// ─── Folder icon mapping (material-icon-theme) ───

import type { FolderFunction } from "@/types/workspace";

const FOLDER_ICON_MAP: Record<FolderFunction, string> = {
  manuscript: "folder-docs",
  experiment: "folder-molecule",
  literature: "folder-bibliography",
  notebook: "folder-content",
  custom: "folder-custom",
} as const;

const DEFAULT_FOLDER = "folder-other";

const FOLDER_ICON_PREFIX = "material-icon-theme";

/**
 * Folder-name -> icon key map. Matched case-insensitively on the folder's
 * display name (lowercased, trimmed). Covers the names most likely to appear
 * in a LaTeX / research project plus common dev folders, so subfolders like
 * `figures` or `src` get a recognizable icon instead of the generic
 * `folder-other`. Names not listed here fall back to the workspace function,
 * then to the default.
 */
const FOLDER_NAME_ICON_MAP: Record<string, string> = {
  // ── LaTeX / research ──
  figures: "folder-images",
  figure: "folder-images",
  images: "folder-images",
  img: "folder-images",
  imgs: "folder-images",
  pics: "folder-images",
  pictures: "folder-images",
  photos: "folder-images",
  plots: "folder-images",
  bib: "folder-bibliography",
  bibtex: "folder-bibliography",
  bibliography: "folder-bibliography",
  refs: "folder-bibliography",
  references: "folder-bibliography",
  citations: "folder-bibliography",
  tex: "folder-docs",
  latex: "folder-docs",
  sections: "folder-docs",
  section: "folder-docs",
  chapters: "folder-docs",
  chapter: "folder-docs",
  manuscript: "folder-docs",
  paper: "folder-docs",
  papers: "folder-docs",
  docs: "folder-docs",
  doc: "folder-docs",
  documentation: "folder-docs",
  abstract: "folder-docs",
  data: "folder-database",
  dataset: "folder-database",
  datasets: "folder-database",
  results: "folder-database",
  output: "folder-database",
  notes: "folder-content",
  note: "folder-content",
  notebook: "folder-content",
  notebooks: "folder-jupyter",
  jupyter: "folder-jupyter",
  experiments: "folder-molecule",
  experiment: "folder-molecule",
  simulations: "folder-simulations",
  simulation: "folder-simulations",
  pdf: "folder-pdf",
  pdfs: "folder-pdf",
  prompts: "folder-prompts",
  prompt: "folder-prompts",
  skills: "folder-skills",
  skill: "folder-skills",

  // ── Source / code ──
  src: "folder-src",
  source: "folder-src",
  sources: "folder-src",
  lib: "folder-lib",
  library: "folder-lib",
  libs: "folder-lib",
  include: "folder-include",
  includes: "folder-include",
  inc: "folder-include",
  components: "folder-components",
  component: "folder-components",
  views: "folder-views",
  view: "folder-views",
  pages: "folder-views",
  page: "folder-views",
  routes: "folder-routes",
  route: "folder-routes",
  router: "folder-routes",
  api: "folder-api",
  server: "folder-server",
  client: "folder-client",
  services: "folder-server",
  utils: "folder-utils",
  util: "folder-utils",
  helpers: "folder-utils",
  helper: "folder-utils",
  tools: "folder-tools",
  tool: "folder-tools",
  hooks: "folder-hook",
  hook: "folder-hook",
  store: "folder-store",
  stores: "folder-store",
  state: "folder-store",
  context: "folder-context",
  contexts: "folder-context",
  types: "folder-typescript",
  typings: "folder-typescript",
  models: "folder-database",
  model: "folder-database",
  scripts: "folder-scripts",
  script: "folder-scripts",
  tasks: "folder-tasks",
  task: "folder-tasks",
  functions: "folder-functions",
  middleware: "folder-middleware",
  controllers: "folder-controller",
  controller: "folder-controller",

  // ── Languages ──
  js: "folder-javascript",
  javascript: "folder-javascript",
  ts: "folder-typescript",
  typescript: "folder-typescript",
  python: "folder-python",
  py: "folder-python",
  rust: "folder-rust",
  go: "folder-go",
  java: "folder-java",
  kotlin: "folder-kotlin",
  scala: "folder-scala",
  lua: "folder-lua",
  r: "folder-r",
  php: "folder-php",
  dart: "folder-dart",
  css: "folder-css",
  styles: "folder-css",
  style: "folder-css",
  sass: "folder-sass",
  scss: "folder-sass",
  less: "folder-less",
  json: "folder-json",
  graphql: "folder-graphql",
  gql: "folder-graphql",
  markdown: "folder-markdown",
  md: "folder-markdown",

  // ── Config / build / env ──
  config: "folder-config",
  configs: "folder-config",
  settings: "folder-config",
  env: "folder-environment",
  environment: "folder-environment",
  build: "folder-dist",
  dist: "folder-dist",
  out: "folder-dist",
  target: "folder-target",
  temp: "folder-temp",
  tmp: "folder-temp",
  cache: "folder-temp",
  logs: "folder-log",
  log: "folder-log",
  coverage: "folder-coverage",
  test: "folder-test",
  tests: "folder-test",
  testing: "folder-test",
  __tests__: "folder-test",
  spec: "folder-test",
  specs: "folder-test",
  mock: "folder-mock",
  mocks: "folder-mock",
  __mocks__: "folder-mock",
  examples: "folder-examples",
  example: "folder-examples",
  samples: "folder-examples",
  templates: "folder-template",
  template: "folder-template",
  theme: "folder-theme",
  themes: "folder-theme",

  // ── Assets / media ──
  assets: "folder-resource",
  asset: "folder-resource",
  resources: "folder-resource",
  resource: "folder-resource",
  media: "folder-resource",
  static: "folder-public",
  public: "folder-public",
  private: "folder-private",
  shared: "folder-shared",
  share: "folder-shared",
  global: "folder-global",
  globals: "folder-global",
  core: "folder-core",
  app: "folder-app",
  apps: "folder-app",
  video: "folder-video",
  videos: "folder-video",
  audio: "folder-audio",
  sound: "folder-audio",
  sounds: "folder-audio",
  font: "folder-font",
  fonts: "folder-font",
  svg: "folder-svg",
  svgs: "folder-svg",
  animation: "folder-animation",
  animations: "folder-animation",
  lottie: "folder-lottie",

  // ── i18n / docs / misc ──
  i18n: "folder-i18n",
  locales: "folder-i18n",
  locale: "folder-i18n",
  lang: "folder-i18n",
  languages: "folder-i18n",
  translations: "folder-i18n",
  rules: "folder-rules",
  rule: "folder-rules",
  plugin: "folder-plugin",
  plugins: "folder-plugin",
  migrations: "folder-migrations",
  migration: "folder-migrations",
  seeds: "folder-seeders",
  seeders: "folder-seeders",
  seed: "folder-seeders",
  mail: "folder-mail",
  emails: "folder-mail",
  email: "folder-mail",
  keys: "folder-keys",
  certificates: "folder-certificate",
  certificate: "folder-certificate",
  license: "folder-license",
  licenses: "folder-license",
  database: "folder-database",
  db: "folder-database",
  prisma: "folder-prisma",
  supabase: "folder-supabase",
  firebase: "folder-firebase",

  // ── Tooling / infra ──
  docker: "folder-docker",
  vscode: "folder-vscode",
  git: "folder-git",
  github: "folder-github",
  gitlab: "folder-gitlab",
  webpack: "folder-webpack",
  gulp: "folder-gulp",
  storybook: "folder-storybook",
  cypress: "folder-cypress",
  eslint: "folder-eslint",
  husky: "folder-husky",
  gradle: "folder-gradle",
  yarn: "folder-yarn",
  terraform: "folder-terraform",
  kubernetes: "folder-kubernetes",
  k8s: "folder-kubernetes",
  helm: "folder-helm",
  nginx: "folder-nginx",
  next: "folder-next",
  nuxt: "folder-nuxt",
  svelte: "folder-svelte",
  vue: "folder-vue",
  unity: "folder-unity",
  godot: "folder-godot",
  blender: "folder-blender",
};

/**
 * Resolve the folder icon key (without prefix / `-open` suffix).
 * Precedence: folder name (case-insensitive) -> workspace function -> default.
 */
function resolveFolderIconKey(name?: string | null, func?: FolderFunction | null): string {
  if (name) {
    const lower = name.trim().toLowerCase();
    if (FOLDER_NAME_ICON_MAP[lower]) return FOLDER_NAME_ICON_MAP[lower];
  }
  return (func && FOLDER_ICON_MAP[func]) ?? DEFAULT_FOLDER;
}

/**
 * Get the full Iconify icon name for a folder. Resolution order:
 *   1. folder display name (case-insensitive match in FOLDER_NAME_ICON_MAP)
 *   2. workspace function (manuscript / notes / etc.)
 *   3. default (folder-other).
 * Pass `name` so subfolders like `figures` / `src` get a fitting icon; pass
 * `func` for workspace-root fallback.
 */
export function getFolderIconName(name?: string | null, func?: FolderFunction | null): string {
  return `${FOLDER_ICON_PREFIX}:${resolveFolderIconKey(name, func)}`;
}

/**
 * Get the expanded/open variant of a folder icon name.
 * Converts "material-icon-theme:folder-docs" → "material-icon-theme:folder-docs-open".
 */
export function getFolderOpenIconName(name?: string | null, func?: FolderFunction | null): string {
  return `${FOLDER_ICON_PREFIX}:${resolveFolderIconKey(name, func)}-open`;
}
