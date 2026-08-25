#!/usr/bin/env node
/**
 * Bundle prismnext-host into extraResources / out/host.
 * This is not a separate Host product — stamp = desktop version + tarball sha256.
 */

import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { create as tarCreate } from "tar";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const desktopVersion = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const arch = process.arch === "arm64" || process.arch === "aarch64" ? "arm64" : process.arch === "x64" || process.arch === "x86_64" ? "x64" : process.arch;
const outDir = join(root, "out", "host");
const currentDir = join(outDir, "current");
const binPath = join(currentDir, "bin", "prismnext-host");
const tarballName = `prismnext-host-${arch}.tar.gz`;
const tarballPath = join(outDir, tarballName);

mkdirSync(join(currentDir, "bin"), { recursive: true });

await build({
  absWorkingDir: root,
  entryPoints: [join(root, "src/host/main.ts")],
  outfile: binPath,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  banner: { js: "#!/usr/bin/env node\n" },
  alias: { "@shared": join(root, "src/shared") },
  logLevel: "info",
});

try {
  chmodSync(binPath, 0o755);
} catch {
  // Windows
}

writeFileSync(
  join(currentDir, "stamp.json"),
  `${JSON.stringify({ desktopVersion, payloadSha256: "pending-tarball" }, null, 2)}\n`,
);

await tarCreate(
  {
    gzip: true,
    file: tarballPath,
    cwd: outDir,
  },
  ["current"],
);

const sha256 = createHash("sha256").update(readFileSync(tarballPath)).digest("hex");
writeFileSync(
  join(currentDir, "stamp.json"),
  `${JSON.stringify({ desktopVersion, payloadSha256: sha256 }, null, 2)}\n`,
);

process.stdout.write(`packed ${tarballName} sha256=${sha256.slice(0, 12)}… desktop=${desktopVersion}\n`);
