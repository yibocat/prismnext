import { defineConfig } from "vitest/config";
import path from "node:path";
import { sharedAliasPlugin } from "./scripts/vite-shared-alias-plugin";

export default defineConfig({
  plugins: [sharedAliasPlugin(__dirname)],
  define: {
    __PRISM_UPDATER_BASE_URL__: '""',
  },
  test: {
    globals: true,
    setupFiles: ["tests/setup.ts"],
    // Keep Node/Electron services out of Vite's client transform path: it
    // cannot bundle node:sqlite. Renderer tests remain browser-like.
    projects: [
      {
        extends: true,
        test: {
          name: "main",
          environment: "node",
          include: ["tests/main/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "shared",
          environment: "node",
          include: ["tests/shared/**/*.test.ts", "tests/scripts/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "renderer",
          environment: "jsdom",
          setupFiles: ["tests/setup.ts", "tests/renderer/setup.tsx"],
          include: ["tests/renderer/**/*.test.ts", "tests/renderer/**/*.test.tsx"],
        },
      },
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src/renderer"),
      "@commands": path.resolve(__dirname, "src/shared/commands"),
      "@prismnext/pro": path.resolve(
        __dirname,
        "src/renderer/lib/pro/absent-module.ts",
      ),
    },
  },
});
