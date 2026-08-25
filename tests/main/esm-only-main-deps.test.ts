import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Packages main actually imports that have no CJS `exports.require`.
 * Left as `require()`, Node either throws or returns a namespace
 * (`electron-store` → TypeError: Store is not a constructor).
 */
const ESM_ONLY_MAIN_DEPS = [
  "@earendil-works/pi-ai",
  "@earendil-works/pi-coding-agent",
  "electron-store",
  "chokidar",
] as const;

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function readDep(name: string): { type?: string; exports?: unknown } {
  const file = join(root, "node_modules", ...name.split("/"), "package.json");
  expect(existsSync(file), `missing ${file}`).toBe(true);
  return JSON.parse(readFileSync(file, "utf8")) as { type?: string; exports?: unknown };
}

function hasRequire(exportsField: unknown): boolean {
  if (exportsField == null || typeof exportsField === "string") return false;
  if (Array.isArray(exportsField)) return exportsField.some(hasRequire);
  if (typeof exportsField === "object") {
    if (Object.prototype.hasOwnProperty.call(exportsField, "require")) return true;
    return Object.values(exportsField as Record<string, unknown>).some(hasRequire);
  }
  return false;
}

describe("main-process ESM-only dependencies", () => {
  it.each(ESM_ONLY_MAIN_DEPS)("%s is type:module without exports.require", (name) => {
    const pkg = readDep(name);
    expect(pkg.type).toBe("module");
    expect(hasRequire(pkg.exports)).toBe(false);
  });
});
