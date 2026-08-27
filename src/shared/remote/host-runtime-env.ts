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
 * / `tectonic` wins — env, Node next-door, the Host script, then `~/.prismnext-host`.
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

export type HostRuntimeStep = "node" | "git" | "tectonic";

export interface HostRuntimeBinStatus {
  available: boolean;
  version: string | null;
  path: string | null;
}

export interface HostRuntimeInventory {
  node: HostRuntimeBinStatus;
  git: HostRuntimeBinStatus;
  tectonic: HostRuntimeBinStatus;
}

export interface HostRuntimePins {
  node: string;
  git: string;
  tectonic: string;
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
}): HostRuntimePins {
  return {
    node: parseHostPinMap(files.node).version ?? "",
    git: parseHostPinMap(files.git).tag ?? "",
    tectonic: parseHostPinMap(files.tectonic).version ?? "",
  };
}

export function mergeHostRuntimePins(...sources: HostRuntimePins[]): HostRuntimePins {
  const next: HostRuntimePins = { node: "", git: "", tectonic: "" };
  for (const source of sources) {
    if (!next.node && source.node) next.node = source.node;
    if (!next.git && source.git) next.git = source.git;
    if (!next.tectonic && source.tectonic) next.tectonic = source.tectonic;
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
  return steps;
}
