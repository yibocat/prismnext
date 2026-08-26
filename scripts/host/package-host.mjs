#!/usr/bin/env node
/**
 * Bundle prismnext-host (JS + Core teams + runtime pins + install-runtime).
 * Node, Git, and Tectonic are not packed here — the Linux server downloads
 * them from the pin files on first connect. Pack does not hit the network.
 */

import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { create as tarCreate } from "tar";
import { hostEsbuildOptions } from "./esbuild-options.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const desktopVersion = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const outDir = join(root, "out", "host");
const currentDir = join(outDir, "current");
const hostJsPath = join(currentDir, "bin", "prismnext-host");
const tarballName = "prismnext-host.tar.gz";

function readPinLines(filePath) {
  return readFileSync(filePath, "utf8")
    .split("\n")
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter(Boolean);
}

function readKeyPin(filePath) {
  const map = {};
  for (const line of readPinLines(filePath)) {
    const space = line.indexOf(" ");
    if (space < 0) continue;
    map[line.slice(0, space)] = line.slice(space + 1).trim();
  }
  return map;
}

function requireSha(pin, key, filePath) {
  const value = pin[key] ?? "";
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${filePath} needs a 64-hex ${key} (got ${value || "empty"})`);
  }
}

const NODE_PIN = readKeyPin(join(root, "scripts/host/node-version.txt"));
const HOST_GIT = readKeyPin(join(root, "scripts/host/git-version.txt"));
const TECTONIC_LINUX = readKeyPin(join(root, "scripts/host/tectonic-linux.txt"));
const TECTONIC_VERSION = readPinLines(join(root, "scripts/tectonic-version.txt"))[0].replace(/^v/, "");

if (!NODE_PIN.version || !NODE_PIN.archive) {
  throw new Error("scripts/host/node-version.txt needs version and archive");
}
requireSha(NODE_PIN, "sha256-x64", "scripts/host/node-version.txt");
requireSha(NODE_PIN, "sha256-arm64", "scripts/host/node-version.txt");
if (!HOST_GIT.tag || !HOST_GIT.archive) {
  throw new Error("scripts/host/git-version.txt needs tag and archive");
}
requireSha(HOST_GIT, "sha256-x64", "scripts/host/git-version.txt");
requireSha(HOST_GIT, "sha256-arm64", "scripts/host/git-version.txt");
if (TECTONIC_LINUX.version !== TECTONIC_VERSION) {
  throw new Error(
    `scripts/host/tectonic-linux.txt version ${TECTONIC_LINUX.version} must match scripts/tectonic-version.txt ${TECTONIC_VERSION}`,
  );
}
if (!TECTONIC_LINUX["triple-x64"] || !TECTONIC_LINUX["triple-arm64"]) {
  throw new Error("scripts/host/tectonic-linux.txt needs triple-x64 and triple-arm64");
}
requireSha(TECTONIC_LINUX, "sha256-x64", "scripts/host/tectonic-linux.txt");
requireSha(TECTONIC_LINUX, "sha256-arm64", "scripts/host/tectonic-linux.txt");

const installSrc = join(root, "scripts/host/install-runtime.sh");
if (!existsSync(installSrc)) {
  throw new Error("scripts/host/install-runtime.sh missing");
}

rmSync(join(currentDir, "bin"), { recursive: true, force: true });
rmSync(join(currentDir, "vendor"), { recursive: true, force: true });
mkdirSync(join(currentDir, "bin"), { recursive: true });
mkdirSync(join(currentDir, "runtime"), { recursive: true });

await build(hostEsbuildOptions({ root, outfile: hostJsPath }));

const pdfJsWorker = join(root, "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs");
if (!existsSync(pdfJsWorker)) {
  throw new Error("pdfjs-dist worker missing; cannot pack Host extract.");
}
copyFileSync(pdfJsWorker, join(currentDir, "bin", "pdf.worker.mjs"));

const coreTeamJson = join(root, "resources", "teams", "prismnext.core", "team.json");
if (!existsSync(coreTeamJson)) {
  throw new Error("resources/teams/prismnext.core missing; remote Chat needs the Core lead agent.");
}
// Core teams + commands only. Never copy resources/pro-package into the public Host tarball.
rmSync(join(currentDir, "resources"), { recursive: true, force: true });
cpSync(join(root, "resources", "teams"), join(currentDir, "resources", "teams"), { recursive: true });
if (existsSync(join(root, "resources", "commands"))) {
  cpSync(join(root, "resources", "commands"), join(currentDir, "resources", "commands"), {
    recursive: true,
  });
}

copyFileSync(installSrc, join(currentDir, "bin", "install-runtime"));
copyFileSync(join(root, "scripts/host/node-version.txt"), join(currentDir, "runtime", "node-version.txt"));
copyFileSync(join(root, "scripts/host/git-version.txt"), join(currentDir, "runtime", "git-version.txt"));
copyFileSync(
  join(root, "scripts/host/tectonic-linux.txt"),
  join(currentDir, "runtime", "tectonic-linux.txt"),
);

try {
  chmodSync(hostJsPath, 0o755);
  chmodSync(join(currentDir, "bin", "install-runtime"), 0o755);
} catch {
  // Windows
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

const stampPath = join(currentDir, "stamp.json");
writeFileSync(
  stampPath,
  `${JSON.stringify({ desktopVersion, payloadSha256: "pending-tarball" }, null, 2)}\n`,
);

for (const leftover of [
  "prismnext-host-linux-x64.tar.gz",
  "prismnext-host-linux-arm64.tar.gz",
  "prismnext-host-arm64.tar.gz",
  "prismnext-host-x64.tar.gz",
]) {
  rmSync(join(outDir, leftover), { force: true });
}

const tarballPath = join(outDir, tarballName);
await tarCreate(
  {
    gzip: true,
    file: tarballPath,
    cwd: outDir,
  },
  ["current"],
);
const sha256 = sha256File(tarballPath);
writeFileSync(
  stampPath,
  `${JSON.stringify({ desktopVersion, payloadSha256: sha256 }, null, 2)}\n`,
);
process.stdout.write(
  `packed ${tarballName} sha256=${sha256.slice(0, 12)}… desktop=${desktopVersion} (slim; server downloads node=${NODE_PIN.version} git=${HOST_GIT.tag} tectonic=${TECTONIC_VERSION})\n`,
);
