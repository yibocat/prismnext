import { mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import { hostEsbuildOptions } from "../../scripts/host/esbuild-options.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const entry = join(root, "tests/main/fixtures/host-pi-config-entry.ts");

describe("host CJS bundle preserves import.meta.url", () => {
  it("can load Pi after the same CJS pack remote Chat uses", async () => {
    const dir = mkdtempSync(join(tmpdir(), "prism-host-bundle-"));
    const outfile = join(dir, "out.cjs");
    await build(hostEsbuildOptions({
      root,
      outfile,
      entryPoints: [entry],
    }));
    const loaded = require(outfile) as { getPackageDir: () => string };
    expect(typeof loaded.getPackageDir()).toBe("string");
    expect(loaded.getPackageDir().length).toBeGreaterThan(0);
  });
});
