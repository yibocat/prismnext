import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import { sharedAliasPlugin } from "./scripts/vite-shared-alias-plugin";

/** Baked into main bundle when `PRISM_UPDATER_BASE_URL` is set at build time. */
function bakedUpdaterBaseUrl(): string {
  const raw = process.env.PRISM_UPDATER_BASE_URL?.trim() ?? "";
  return raw ? raw.replace(/\/$/, "") : "";
}

/**
 * Build-time gate for the Agent Pack (v2) architecture rework — see
 * docs-private/specs/2026-08-08-agent-pack-architecture-refactor.md (Phase 0).
 * Set `PRISM_PACKS_V2=1` at dev/build time to expose packs-v2 surfaces
 * (Plugins nav entry, Settings → Plugins) while the rebuild is underway.
 * Default OFF so 0.6.x releases ship no plugins entry points.
 */
function bakedPacksV2Flag(): boolean {
  return process.env.PRISM_PACKS_V2 === "1";
}

export default defineConfig({
  main: {
    define: {
      __PRISM_UPDATER_BASE_URL__: JSON.stringify(bakedUpdaterBaseUrl()),
      __PRISM_PACKS_V2__: JSON.stringify(bakedPacksV2Flag()),
    },
    plugins: [
      sharedAliasPlugin(__dirname),
      {
        name: "copy-tectonic-daemon-worker",
        closeBundle() {
          const src = resolve(__dirname, "src/main/services/tectonic-daemon-worker.mjs");
          const dest = resolve(__dirname, "out/main/tectonic-daemon-worker.mjs");
          mkdirSync(dirname(dest), { recursive: true });
          copyFileSync(src, dest);
        },
      },
    ],
    build: {
      rollupOptions: {
        external: ["electron", "node-pty", "@napi-rs/canvas", "font-list"],
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
    define: {
      __PRISM_PACKS_V2__: JSON.stringify(bakedPacksV2Flag()),
    },
    plugins: [react(), sharedAliasPlugin(__dirname)],
    resolve: {
      alias: {
        "@": resolve("src/renderer"),
        "@commands": resolve("src/main/commands"),
        // Open-core: OSS → no-op stub. Dev/official: `PRISM_PRO_PATH=../prism-next-pro/src`
        "@prismnext/pro": process.env.PRISM_PRO_PATH
          ? resolve(process.env.PRISM_PRO_PATH)
          : resolve("src/renderer/lib/pro/absent-module.ts"),
      },
      dedupe: ["@codemirror/state", "@codemirror/view", "@codemirror/merge", "pdfjs-dist"],
    },
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
      exclude: ["pdfjs-dist"],
      esbuildOptions: {
        target: "esnext",
      },
    },
  },
});
