import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAppPath, getResourcesPath, isAppPackaged } from "../app/paths";

export type HostLinuxArch = "linux-x64" | "linux-arm64";

/** Arch-independent Host program tarball. Node / Git / Tectonic are downloaded on the server. */
export const HOST_PAYLOAD_FILE_NAME = "prismnext-host.tar.gz";

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

export function hostPayloadFileName(_arch?: string): string {
  return HOST_PAYLOAD_FILE_NAME;
}

export function sha256File(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function payloadCandidates(opts?: {
  packaged?: boolean;
  resourcesPath?: string;
  appPath?: string;
}): string[] {
  const packaged = opts?.packaged ?? isAppPackaged();
  const names = [
    HOST_PAYLOAD_FILE_NAME,
    "prismnext-host-linux-x64.tar.gz",
    "prismnext-host-linux-arm64.tar.gz",
  ];
  const dirs: string[] = [];
  if (packaged) {
    dirs.push(join(opts?.resourcesPath ?? getResourcesPath(), "host"));
  } else {
    const appPath = opts?.appPath ?? getAppPath();
    dirs.push(join(appPath, "out", "host"));
    dirs.push(join(process.cwd(), "out", "host"));
  }
  return dirs.flatMap((dir) => names.map((name) => join(dir, name)));
}

export function resolveBundledHostPayload(opts?: {
  packaged?: boolean;
  resourcesPath?: string;
  appPath?: string;
  arch?: string;
}): HostPayloadRef | { error: "payload_missing_local" } {
  const arch = normalizeHostLinuxArch(opts?.arch ?? "") ?? "linux-x64";
  for (const path of payloadCandidates(opts)) {
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
  return !("error" in resolveBundledHostPayload(opts));
}
