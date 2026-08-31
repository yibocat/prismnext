import { join } from "node:path";

/**
 * Shared Host bundle settings. Desktop main (Rollup) already rewrites
 * `import.meta.url` to `pathToFileURL(__filename).href`. esbuild CJS does
 * not — it emits `import_meta = {}` — so Pi's config.js throws on load.
 */
export function hostEsbuildOptions({ root, outfile, entryPoints }) {
  return {
    absWorkingDir: root,
    entryPoints: entryPoints ?? [join(root, "src/host/main.ts")],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node24",
    banner: {
      js: [
        "#!/usr/bin/env node",
        // CJS has no import.meta.url. Desktop Rollup inlines pathToFileURL(__filename);
        // esbuild define only accepts an identifier, so hoist it here.
        'var __import_meta_url = require("node:url").pathToFileURL(__filename).href;',
        "",
      ].join("\n"),
    },
    define: {
      "import.meta.url": "__import_meta_url",
    },
    alias: {
      "@shared": join(root, "src/shared"),
      electron: join(root, "src/host/electron-shim.ts"),
    },
    logLevel: "warning",
  };
}
