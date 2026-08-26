import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveWorkbenchHome } from "../main/workbench/home";

export const HOST_PERMISSION_KEYS = [
  "toolAllowAlways",
  "bashAllowAlwaysPatterns",
  "permissionAllowedPaths",
  "permissionAllowRules",
  "permissionDenyRules",
  "permissionMode",
] as const;

export type HostPermissionPatch = {
  toolAllowAlways?: string[];
  bashAllowAlwaysPatterns?: string[];
  permissionAllowedPaths?: string[];
  permissionAllowRules?: string[];
  permissionDenyRules?: string[];
  permissionMode?: string;
};

function permissionsPath(): string {
  return join(resolveWorkbenchHome(), "host-permissions.json");
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string");
}

export function readHostPermissions(): HostPermissionPatch {
  try {
    const parsed = JSON.parse(readFileSync(permissionsPath(), "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const rec = parsed as Record<string, unknown>;
    return {
      toolAllowAlways: asStringArray(rec.toolAllowAlways),
      bashAllowAlwaysPatterns: asStringArray(rec.bashAllowAlwaysPatterns),
      permissionAllowedPaths: asStringArray(rec.permissionAllowedPaths),
      permissionAllowRules: asStringArray(rec.permissionAllowRules),
      permissionDenyRules: asStringArray(rec.permissionDenyRules),
      permissionMode: typeof rec.permissionMode === "string" ? rec.permissionMode : undefined,
    };
  } catch {
    return {};
  }
}

export function writeHostPermissions(patch: HostPermissionPatch): HostPermissionPatch {
  const next = { ...readHostPermissions(), ...patch };
  mkdirSync(resolveWorkbenchHome(), { recursive: true });
  writeFileSync(permissionsPath(), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export function pickPermissionPatch(input: unknown): HostPermissionPatch | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const rec = input as Record<string, unknown>;
  const out: HostPermissionPatch = {};
  let hit = false;
  for (const key of HOST_PERMISSION_KEYS) {
    if (!(key in rec)) continue;
    hit = true;
    if (key === "permissionMode") {
      if (typeof rec[key] === "string") out.permissionMode = rec[key];
      continue;
    }
    const list = asStringArray(rec[key]);
    if (list) (out as Record<string, unknown>)[key] = list;
  }
  return hit ? out : null;
}
