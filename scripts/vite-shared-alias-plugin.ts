import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

/** Match tsconfig `@shared/*` → main/services then src/shared. */
export function sharedAliasPlugin(rootDir: string): Plugin {
  const bases = [
    path.resolve(rootDir, "src/main/services"),
    path.resolve(rootDir, "src/shared"),
  ];

  // Avoid up to 8 sync fs.existsSync calls per `@shared/*` import.
  // Cleared on build start / watched-file change so new files resolve.
  const resolveCache = new Map<string, string | null>();

  function resolveShared(subpath: string): string | null {
    const cached = resolveCache.get(subpath);
    if (cached !== undefined) return cached;
    let resolved: string | null = null;
    for (const base of bases) {
      const candidates = [
        path.join(base, subpath),
        path.join(base, `${subpath}.ts`),
        path.join(base, `${subpath}.tsx`),
        path.join(base, subpath, "index.ts"),
      ];
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          resolved = candidate;
          break;
        }
      }
      if (resolved) break;
    }
    resolveCache.set(subpath, resolved);
    return resolved;
  }

  return {
    name: "prism-shared-alias",
    enforce: "pre",
    buildStart() {
      resolveCache.clear();
    },
    watchChange() {
      resolveCache.clear();
    },
    resolveId(source) {
      if (source === "@shared") {
        return resolveShared("index") ?? bases[0];
      }
      if (!source.startsWith("@shared/")) return null;
      return resolveShared(source.slice("@shared/".length));
    },
  };
}
