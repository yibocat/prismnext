/**
 * Ensure node-pty native addon matches Electron's Node ABI.
 * (Literature DB uses built-in node:sqlite — no better-sqlite3 rebuild dance.)
 */
import { execSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function electronBinary() {
  return require("electron");
}

function probeNodePtyElectron() {
  const snippet = [
    "const path = require('path');",
    "const pkgRoot = path.dirname(require.resolve('node-pty/package.json'));",
    "process.dlopen({ exports: {} }, path.join(pkgRoot, 'build/Release/pty.node'));",
  ].join("");
  const result = spawnSync(electronBinary(), ["-e", snippet], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: "pipe",
  });
  return result.status === 0;
}

if (probeNodePtyElectron()) {
  console.log("[native] node-pty OK for Electron");
} else {
  console.log("[native] Rebuilding node-pty for Electron…");
  execSync("pnpm exec electron-rebuild -f -w node-pty", { cwd: root, stdio: "inherit" });
  if (!probeNodePtyElectron()) {
    throw new Error("[native] node-pty failed to load under Electron after rebuild");
  }
  console.log("[native] node-pty OK for Electron");
}
