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
