import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { builtinModules, createRequire } from "node:module";
import { dirname, resolve } from "path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import { sharedAliasPlugin } from "./scripts/vite-shared-alias-plugin";

const nodeRequire = createRequire(import.meta.url);

function readDependencyPackageJson(name: string): { type?: string; exports?: unknown } | null {
  const file = resolve(__dirname, "node_modules", ...name.split("/"), "package.json");
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as { type?: string; exports?: unknown };
}

function exportTreeHasRequire(exportsField: unknown): boolean {
  if (exportsField == null || typeof exportsField === "string") return false;
  if (Array.isArray(exportsField)) return exportsField.some(exportTreeHasRequire);
  if (typeof exportsField === "object") {
    if (Object.prototype.hasOwnProperty.call(exportsField, "require")) return true;
    return Object.values(exportsField as Record<string, unknown>).some(exportTreeHasRequire);
  }
  return false;
}

/**
 * ESM-only packages cannot be left as CJS `require()`:
 * - no `exports.require` → ERR_PACKAGE_PATH_NOT_EXPORTED (Pi)
 * - `export default class` → require() is the namespace, `new X` throws (electron-store)
 */
function esmOnlyDependencyNames(): string[] {
  const root = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
  };
  return Object.keys(root.dependencies ?? {}).filter((name) => {
    const pkg = readDependencyPackageJson(name);
    return pkg?.type === "module" && !exportTreeHasRequire(pkg.exports);
  });
}

const esmOnlyDeps = esmOnlyDependencyNames();

function collectBundleRequires(src: string): string[] {
  const specs = new Set<string>();
  const re = /require\((["'])([^"']+)\1\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(src))) specs.add(match[2]);
  return [...specs];
}

function packageNameFromSpecifier(spec: string): string {
  if (spec.startsWith("@")) {
    const [scope, name] = spec.split("/");
    return name ? `${scope}/${name}` : spec;
  }
  return spec.split("/")[0] ?? spec;
}

/**
 * After bundling, leftover `require()` must resolve as CJS, and ESM-only
 * packages must not appear as externals (resolve() succeeding is not enough —
 * electron-store resolves, then `new Store` throws).
 */
function assertMainCjsExternalsResolvable() {
  return {
    name: "assert-main-cjs-externals",
    closeBundle() {
      const bundlePath = resolve(__dirname, "out/main/index.js");
      const specs = collectBundleRequires(readFileSync(bundlePath, "utf8"));
      const skip = new Set<string>([
        ...builtinModules,
        ...builtinModules.map((name) => `node:${name}`),
        "electron",
      ]);
      const esmOnly = new Set(esmOnlyDeps);
      const missing: string[] = [];
      const leakedEsm: string[] = [];
      for (const spec of specs) {
        if (spec.startsWith(".") || spec.startsWith("/") || skip.has(spec)) continue;
        if (esmOnly.has(packageNameFromSpecifier(spec))) leakedEsm.push(spec);
        try {
          nodeRequire.resolve(spec);
        } catch {
          missing.push(spec);
        }
      }
      if (missing.length > 0 || leakedEsm.length > 0) {
        throw new Error(
          [
            missing.length > 0
              ? `Main CJS bundle require()s specifiers Node cannot resolve:\n${missing.map((spec) => `  - ${spec}`).join("\n")}`
              : "",
            leakedEsm.length > 0
              ? `Main CJS bundle still require()s ESM-only packages (must be inlined):\n${leakedEsm.map((spec) => `  - ${spec}`).join("\n")}`
              : "",
          ]
            .filter(Boolean)
            .join("\n"),
        );
      }
    },
  };
}

/** Baked into main bundle when `PRISM_UPDATER_BASE_URL` is set at build time. */
function bakedUpdaterBaseUrl(): string {
  const raw = process.env.PRISM_UPDATER_BASE_URL?.trim() ?? "";
  return raw ? raw.replace(/\/$/, "") : "";
}

export default defineConfig({
  main: {
    define: {
      __PRISM_UPDATER_BASE_URL__: JSON.stringify(bakedUpdaterBaseUrl()),
    },
    plugins: [
      sharedAliasPlugin(__dirname),
      {
        name: "copy-tectonic-daemon-worker",
        closeBundle() {
          const src = resolve(__dirname, "src/main/compile/tectonic-daemon-worker.mjs");
          const dest = resolve(__dirname, "out/main/tectonic-daemon-worker.mjs");
          mkdirSync(dirname(dest), { recursive: true });
          copyFileSync(src, dest);
        },
      },
      assertMainCjsExternalsResolvable(),
    ],
    build: {
      // CJS main + electron-vite's default "externalize all deps" cannot load
      // ESM-only packages (Pi, electron-store, chokidar 5, …). Inline them.
      // MCP deep imports are a different bug — their exports wildcard omits .js.
      externalizeDeps: {
        exclude: esmOnlyDeps,
      },
      rollupOptions: {
        external: ["electron", "node-pty", "@napi-rs/canvas", "font-list", "@firecrawl/anydoc"],
      },
    },
  },
  preload: {
    plugins: [sharedAliasPlugin(__dirname)],
    build: {
      rollupOptions: {
        external: ["electron"],
      },
    },
  },
  renderer: {
    plugins: [react(), sharedAliasPlugin(__dirname)],
    resolve: {
      alias: {
        "@": resolve("src/renderer"),
        "@commands": resolve("src/shared/commands"),
        // Open-core: OSS → no-op stub. Dev/official: `PRISM_PRO_PATH=../prism-next-pro/src`
        "@prismnext/pro": process.env.PRISM_PRO_PATH
          ? resolve(process.env.PRISM_PRO_PATH)
          : resolve("src/renderer/lib/pro/absent-module.ts"),
      },
      dedupe: ["@codemirror/state", "@codemirror/view", "@codemirror/merge", "pdfjs-dist"],
    },
    assetsInclude: ["**/*.wasm"],
    server: {
      fs: {
        // Allow all files for local dev (KaTeX fonts in pnpm store)
        strict: false,
      },
    },
    worker: {
      format: "es",
    },
    build: {
      rollupOptions: {
        output: {
          format: "es",
          // Split heavy shared dependencies into on-demand chunks.
          // CodeMirror alone is ~4 MB — keeping it out of the entry
          // chunk lets the window paint instantly, then load the
          // editor on first file open.
          manualChunks(id) {
            if (id.includes("node_modules/@codemirror")) {
              return "codemirror";
            }
            if (id.includes("node_modules/pdfjs-dist")) {
              return "pdfjs";
            }
            if (id.includes("node_modules/shiki") || id.includes("node_modules/@shikijs")) {
              return "markdown-viewer";
            }
            if (
              id.includes("node_modules/react-markdown") ||
              id.includes("node_modules/remark-") ||
              id.includes("node_modules/rehype-") ||
              id.includes("node_modules/katex")
            ) {
              return "markdown-viewer";
            }
            if (id.includes("node_modules/@xterm")) {
              return "xterm";
            }
          },
        },
      },
      target: "esnext",
    },
    optimizeDeps: {
      // Legacy build is already a webpack bundle — don't re-bundle.
      // Paths are explicit to avoid pulling in the modern ESM build.
      exclude: [
        "pdfjs-dist",
      ],
      esbuildOptions: {
        target: "esnext",
      },
    },
  },
});
