import { HOST_CURRENT_DIRNAME, HOST_INSTALL_DIRNAME } from "../workbench/paths";

/** Host payload layout on the server: `~/.prismnext-host/current`. */

export function hostPayloadBinDir(currentDir: string): string {
  return `${normalizeHostDir(currentDir)}/bin`;
}

export function hostPayloadGitBinDir(currentDir: string): string {
  return `${normalizeHostDir(currentDir)}/vendor/git/bin`;
}

export function hostPayloadGitExecDir(currentDir: string): string {
  return `${normalizeHostDir(currentDir)}/vendor/git/libexec/git-core`;
}

export function hostHomeCurrentBinDir(home: string): string {
  return hostPayloadBinDir(`${normalizeHostDir(home)}/${HOST_INSTALL_DIRNAME}/${HOST_CURRENT_DIRNAME}`);
}

export function hostPayloadBinDirFromHostBin(hostBin: string): string {
  const normalized = normalizeHostDir(hostBin);
  return normalized.endsWith("/prismnext-host")
    ? normalized.slice(0, -"/prismnext-host".length)
    : posixDirname(normalized);
}

export function posixDirname(path: string): string {
  const normalized = normalizeHostDir(path);
  const slash = normalized.lastIndexOf("/");
  return slash <= 0 ? "/" : normalized.slice(0, slash);
}

/**
 * Places the Host payload `bin/` may live. First existing `prismnext-host`
 * / `tectonic` / `tinymist` wins — env, Node next-door, the Host script, then `~/.prismnext-host`.
 */
export function listHostRuntimeBinCandidates(input: {
  envBinDir?: string | null;
  execPath?: string | null;
  argv1?: string | null;
  home?: string | null;
}): string[] {
  const out: string[] = [];
  const push = (value?: string | null) => {
    const normalized = typeof value === "string" ? normalizeHostDir(value.trim()) : "";
    if (normalized && !out.includes(normalized)) out.push(normalized);
  };
  push(input.envBinDir);
  if (input.execPath) push(posixDirname(input.execPath));
  if (input.argv1) push(posixDirname(input.argv1));
  if (input.home) push(hostHomeCurrentBinDir(input.home));
  return out;
}

function normalizeHostDir(currentDir: string): string {
  return currentDir.replace(/\\/g, "/").replace(/\/+$/, "");
}

export type HostRuntimeStep = "node" | "git" | "tectonic" | "tinymist" | "anydoc";

export const HOST_RUNTIME_STEPS: readonly HostRuntimeStep[] = [
  "node",
  "git",
  "tectonic",
  "tinymist",
  "anydoc",
];

export interface HostRuntimeBinStatus {
  available: boolean;
  version: string | null;
  path: string | null;
}

export interface HostRuntimeInventory {
  node: HostRuntimeBinStatus;
  git: HostRuntimeBinStatus;
  tectonic: HostRuntimeBinStatus;
  tinymist: HostRuntimeBinStatus;
  anydoc: HostRuntimeBinStatus;
}

export interface HostRuntimePins {
  node: string;
  git: string;
  tectonic: string;
  tinymist: string;
  anydoc: string;
}

/** Key/value pin or runtime-stamp text (`version 24.19.0`, `node 24.19.0`). */
export function parseHostPinMap(raw: string | null | undefined): Record<string, string> {
  const map: Record<string, string> = {};
  if (!raw) return map;
  for (const line of raw.split("\n")) {
    const trimmed = line.replace(/#.*$/, "").trim();
    if (!trimmed) continue;
    const space = trimmed.indexOf(" ");
    if (space < 0) continue;
    map[trimmed.slice(0, space)] = trimmed.slice(space + 1).trim();
  }
  return map;
}

export function hostRuntimePinsFromFiles(files: {
  node?: string | null;
  git?: string | null;
  tectonic?: string | null;
  tinymist?: string | null;
  anydoc?: string | null;
}): HostRuntimePins {
  return {
    node: parseHostPinMap(files.node).version ?? "",
    git: parseHostPinMap(files.git).tag ?? "",
    tectonic: parseHostPinMap(files.tectonic).version ?? "",
    tinymist: parseHostPinMap(files.tinymist).version ?? "",
    anydoc: parseHostPinMap(files.anydoc).version ?? "",
  };
}

export function mergeHostRuntimePins(...sources: HostRuntimePins[]): HostRuntimePins {
  const next: HostRuntimePins = { node: "", git: "", tectonic: "", tinymist: "", anydoc: "" };
  for (const source of sources) {
    if (!next.node && source.node) next.node = source.node;
    if (!next.git && source.git) next.git = source.git;
    if (!next.tectonic && source.tectonic) next.tectonic = source.tectonic;
    if (!next.tinymist && source.tinymist) next.tinymist = source.tinymist;
    if (!next.anydoc && source.anydoc) next.anydoc = source.anydoc;
  }
  return next;
}

function normalizeNodeVersion(value: string): string {
  return value.trim().replace(/^v/i, "");
}

function binNeedsInstall(
  status: HostRuntimeBinStatus,
  pin: string,
  kind: HostRuntimeStep,
): boolean {
  if (!status.available) return true;
  if (!pin || !status.version) return false;
  if (kind === "node") {
    return normalizeNodeVersion(status.version) !== normalizeNodeVersion(pin);
  }
  return status.version !== pin;
}

/** SSH `sftpStat` `{ size: 0 }` is a missing file, not an installed binary. */
export function runtimeBinFromStat(
  stat: { size: number } | null,
  path: string,
  version: string | null,
): HostRuntimeBinStatus {
  if (!stat || stat.size <= 0) {
    return { available: false, version: null, path: null };
  }
  return { available: true, version, path };
}

export function inventoryMissingSteps(
  inv: HostRuntimeInventory,
  pins: HostRuntimePins,
): HostRuntimeStep[] {
  const steps: HostRuntimeStep[] = [];
  if (binNeedsInstall(inv.node, pins.node, "node")) steps.push("node");
  if (binNeedsInstall(inv.git, pins.git, "git")) steps.push("git");
  if (binNeedsInstall(inv.tectonic, pins.tectonic, "tectonic")) steps.push("tectonic");
  if (binNeedsInstall(inv.tinymist, pins.tinymist, "tinymist")) steps.push("tinymist");
  if (binNeedsInstall(inv.anydoc, pins.anydoc, "anydoc")) steps.push("anydoc");
  return steps;
}

export function hostLinuxArchFromNode(arch = process.arch): "x64" | "arm64" | null {
  if (arch === "x64") return "x64";
  if (arch === "arm64") return "arm64";
  return null;
}

export function hostAnydocLinuxPackageName(arch: "x64" | "arm64"): string {
  return arch === "arm64"
    ? "@firecrawl/anydoc-linux-arm64-gnu"
    : "@firecrawl/anydoc-linux-x64-gnu";
}

export function hostPayloadAnydocNativePath(currentDir: string, arch: "x64" | "arm64"): string {
  const pkg = hostAnydocLinuxPackageName(arch);
  const file = arch === "arm64" ? "anydoc.linux-arm64-gnu.node" : "anydoc.linux-x64-gnu.node";
  return `${normalizeHostDir(currentDir)}/node_modules/${pkg}/${file}`;
}

export function hostPayloadAnydocNativeCandidates(
  currentDir: string,
  arch?: "x64" | "arm64" | null,
): string[] {
  if (arch === "x64" || arch === "arm64") {
    return [hostPayloadAnydocNativePath(currentDir, arch)];
  }
  return [
    hostPayloadAnydocNativePath(currentDir, "x64"),
    hostPayloadAnydocNativePath(currentDir, "arm64"),
  ];
}
