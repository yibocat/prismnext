import { resolve } from "path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: ["electron"],
      },
    },
  },
  preload: {
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
      },
      dedupe: ["@codemirror/state", "@codemirror/view", "@codemirror/merge"],
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
        },
      },
      target: "esnext",
    },
    optimizeDeps: {
      exclude: ["mupdf"],
      esbuildOptions: {
        target: "esnext",
      },
    },
  },
});
