import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAppPath, getResourcesPath, isAppPackaged } from "../app/paths";

export interface HostPayloadRef {
  path: string;
  sha256: string;
  arch: string;
}

export function normalizeHostArch(arch: string = process.arch): string {
  if (arch === "arm64" || arch === "aarch64") return "arm64";
  if (arch === "x64" || arch === "x86_64" || arch === "amd64") return "x64";
  return arch;
}

export function hostPayloadFileName(arch: string = process.arch): string {
  return `prismnext-host-${normalizeHostArch(arch)}.tar.gz`;
}

export function sha256File(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

export function resolveBundledHostPayload(opts?: {
  packaged?: boolean;
  resourcesPath?: string;
  appPath?: string;
  arch?: string;
}): HostPayloadRef | { error: "payload_missing_local" } {
  const arch = normalizeHostArch(opts?.arch ?? process.arch);
  const name = hostPayloadFileName(arch);
  const packaged = opts?.packaged ?? isAppPackaged();
  const candidates: string[] = [];
  if (packaged) {
    candidates.push(join(opts?.resourcesPath ?? getResourcesPath(), "host", name));
  } else {
    const appPath = opts?.appPath ?? getAppPath();
    candidates.push(join(appPath, "out", "host", name));
    candidates.push(join(process.cwd(), "out", "host", name));
  }

  for (const path of candidates) {
    if (existsSync(path)) {
      return { path, sha256: sha256File(path), arch };
    }
  }
  return { error: "payload_missing_local" };
}
