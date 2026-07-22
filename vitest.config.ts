import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  define: {
    __PRISM_UPDATER_BASE_URL__: '""',
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src/renderer"),
      "@shared": path.resolve(__dirname, "src/main/services"),
    },
  },
});
