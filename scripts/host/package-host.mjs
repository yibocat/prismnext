#!/usr/bin/env node
/**
 * Bundle prismnext-host + a dedicated Linux Node into extraResources / out/host.
 * This is not a separate Host product — stamp = desktop version + tarball sha256.
 * Node is downloaded only at pack time (nodejs.org). Connect never hits the network.
 */

import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
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
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { create as tarCreate, extract as tarExtract } from "tar";
import { hostEsbuildOptions } from "./esbuild-options.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const desktopVersion = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const outDir = join(root, "out", "host");
const currentDir = join(outDir, "current");
const hostJsPath = join(currentDir, "bin", "prismnext-host");
const cacheDir = join(root, "scripts/host/.node-cache");

/** Pinned official Node 24 LTS — matches esbuild target: node24 and Electron 43. Bump here on purpose. */
const NODE_VERSION = "24.19.0";
const LINUX_ARCHS = [
  { payload: "linux-x64", node: "x64" },
  { payload: "linux-arm64", node: "arm64" },
];

mkdirSync(join(currentDir, "bin"), { recursive: true });
mkdirSync(cacheDir, { recursive: true });

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
rmSync(join(currentDir, "resources"), { recursive: true, force: true });
cpSync(join(root, "resources", "teams"), join(currentDir, "resources", "teams"), { recursive: true });
if (existsSync(join(root, "resources", "commands"))) {
  cpSync(join(root, "resources", "commands"), join(currentDir, "resources", "commands"), {
    recursive: true,
  });
}

try {
  chmodSync(hostJsPath, 0o755);
} catch {
  // Windows
}

async function download(url, dest) {
  const { get } = await import("node:https");
  await new Promise((resolveDownload, reject) => {
    const request = (target) => {
      get(target, (response) => {
        const code = response.statusCode ?? 0;
        if (code >= 300 && code < 400 && response.headers.location) {
          response.resume();
          request(response.headers.location);
          return;
        }
        if (code !== 200) {
          reject(new Error(`download failed ${code} ${target}`));
          response.resume();
          return;
        }
        pipeline(response, createWriteStream(dest)).then(resolveDownload).catch(reject);
      }).on("error", reject);
    };
    request(url);
  });
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

async function ensureOfficialNode(nodeArch) {
  const folder = `node-v${NODE_VERSION}-linux-${nodeArch}`;
  const tarName = `${folder}.tar.gz`;
  const tarPath = join(cacheDir, tarName);
  const sumsPath = join(cacheDir, `SHASUMS256-${NODE_VERSION}.txt`);
  const extractedNode = join(cacheDir, folder, "bin", "node");
  if (existsSync(extractedNode)) return extractedNode;

  if (!existsSync(sumsPath)) {
    process.stdout.write(`downloading Node ${NODE_VERSION} checksums…\n`);
    await download(`https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt`, sumsPath);
  }
  if (!existsSync(tarPath)) {
    process.stdout.write(`downloading ${tarName}…\n`);
    await download(`https://nodejs.org/dist/v${NODE_VERSION}/${tarName}`, tarPath);
  }
  const sums = readFileSync(sumsPath, "utf8");
  const line = sums.split("\n").find((row) => row.endsWith(`  ${tarName}`));
  const expected = line?.slice(0, 64);
  if (!expected) throw new Error(`no checksum for ${tarName}`);
  const actual = sha256File(tarPath);
  if (actual !== expected) {
    throw new Error(`Node tarball checksum mismatch for ${tarName}`);
  }

  const extractRoot = join(cacheDir, `extract-${nodeArch}`);
  rmSync(extractRoot, { recursive: true, force: true });
  mkdirSync(extractRoot, { recursive: true });
  await tarExtract({ file: tarPath, cwd: extractRoot });
  const from = join(extractRoot, folder, "bin", "node");
  if (!existsSync(from)) throw new Error(`official Node archive missing bin/node (${tarName})`);
  mkdirSync(join(cacheDir, folder, "bin"), { recursive: true });
  copyFileSync(from, extractedNode);
  chmodSync(extractedNode, 0o755);
  rmSync(extractRoot, { recursive: true, force: true });
  return extractedNode;
}

for (const item of LINUX_ARCHS) {
  const nodeBin = await ensureOfficialNode(item.node);
  const destNode = join(currentDir, "bin", "node");
  copyFileSync(nodeBin, destNode);
  chmodSync(destNode, 0o755);

  const stampPath = join(currentDir, "stamp.json");
  writeFileSync(
    stampPath,
    `${JSON.stringify({ desktopVersion, payloadSha256: "pending-tarball" }, null, 2)}\n`,
  );

  const tarballName = `prismnext-host-${item.payload}.tar.gz`;
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
    `packed ${tarballName} sha256=${sha256.slice(0, 12)}… desktop=${desktopVersion} node=${NODE_VERSION}-${item.node}\n`,
  );
}
