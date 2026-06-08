import { resolve } from "path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    resolve: {
      alias: {
        "@shared": resolve("src/shared"),
      },
    },
    build: {
      rollupOptions: {
        external: ["electron", "node-pty"],
      },
    },
  },
  preload: {
    resolve: {
      alias: {
        "@shared": resolve("src/shared"),
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
        "@shared": resolve("src/shared"),
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
