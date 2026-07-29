import { resolve } from "path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";

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
    resolve: {
      alias: {
        "@shared": resolve("src/main/services"),
      },
    },
    build: {
      rollupOptions: {
        // plotly.js-dist-min / three / mermaid / @hpcc-js/wasm: read as raw
        // text assets at runtime for offscreen thumbnail capture
        // (interaction-thumbnail.ts, figure.script's optional THREE
        // injection) — must not be bundled/inlined, only resolved via
        // require.resolve() against real node_modules.
        external: [
          "electron",
          "node-pty",
          "@napi-rs/canvas",
          "plotly.js-dist-min",
          "three",
          "mermaid",
          "@hpcc-js/wasm",
        ],
      },
    },
  },
  preload: {
    resolve: {
      alias: {
        "@shared": resolve("src/main/services"),
      },
    },
    build: {
      rollupOptions: {
        external: ["electron"],
      },
    },
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        "@": resolve("src/renderer"),
        "@shared": resolve("src/main/services"),
        "@commands": resolve("src/main/commands"),
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
            // Interaction: keep heavy viz libs in separate async chunks to cut peak build RAM.
            if (id.includes("node_modules/plotly.js") || id.includes("node_modules/plotly.js-dist-min")) {
              return "plotly";
            }
            if (id.includes("node_modules/three")) {
              return "three";
            }
            if (id.includes("node_modules/mermaid")) {
              return "mermaid";
            }
            if (id.includes("node_modules/@hpcc-js")) {
              return "graphviz";
            }
            if (id.includes("node_modules/@observablehq/plot")) {
              return "observable-plot";
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
