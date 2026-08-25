import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAppPath, getResourcesPath, isAppPackaged } from "../app/paths";

export type HostLinuxArch = "linux-x64" | "linux-arm64";

export interface HostPayloadRef {
  path: string;
  sha256: string;
  arch: HostLinuxArch;
}

export function parseRemoteUnameMachine(raw: string): HostLinuxArch | null {
  const machine = raw.trim().toLowerCase();
  if (machine === "x86_64" || machine === "amd64") return "linux-x64";
  if (machine === "aarch64" || machine === "arm64") return "linux-arm64";
  return null;
}

export function normalizeHostLinuxArch(arch: string): HostLinuxArch | null {
  const raw = arch.trim().toLowerCase();
  if (raw === "linux-x64" || raw === "x64" || raw === "x86_64" || raw === "amd64") return "linux-x64";
  if (raw === "linux-arm64" || raw === "arm64" || raw === "aarch64") return "linux-arm64";
  return null;
}

export function hostPayloadFileName(arch: string): string {
  const linux = normalizeHostLinuxArch(arch);
  return `prismnext-host-${linux ?? "unknown"}.tar.gz`;
}

export function sha256File(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

export function resolveBundledHostPayload(opts?: {
  packaged?: boolean;
  resourcesPath?: string;
  appPath?: string;
  arch: string;
}): HostPayloadRef | { error: "payload_missing_local" } {
  const arch = normalizeHostLinuxArch(opts?.arch ?? "");
  if (!arch) return { error: "payload_missing_local" };
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

export function hasBundledLinuxHostPayload(opts?: {
  packaged?: boolean;
  resourcesPath?: string;
  appPath?: string;
}): boolean {
  return (
    !("error" in resolveBundledHostPayload({ ...opts, arch: "linux-x64" }))
    || !("error" in resolveBundledHostPayload({ ...opts, arch: "linux-arm64" }))
  );
}
