import { encodeRemoteAbs, normalizePosixAbs } from "@shared/remote";

export type NewProjectLocation =
  | { kind: "local"; parentPath: string }
  | { kind: "remote"; profileId: string; parentPosix: string };

function joinLocalParent(parentPath: string, name: string): string {
  const windows = /(?:^[A-Za-z]:[\\/])|(?:^\\\\)/.test(parentPath);
  const sep = windows && parentPath.includes("\\") && !parentPath.includes("/") ? "\\" : "/";
  return `${parentPath.replace(/[/\\]+$/, "")}${sep}${name}`;
}

export function newProjectRoot(location: NewProjectLocation, name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed || trimmed.includes("/") || trimmed.includes("\\")) return null;
  if (location.kind === "local") {
    if (!location.parentPath.trim()) return null;
    return joinLocalParent(location.parentPath, trimmed);
  }
  const parent = normalizePosixAbs(location.parentPosix);
  if (!parent) return null;
  const abs = parent === "/" ? `/${trimmed}` : `${parent}/${trimmed}`;
  return encodeRemoteAbs(location.profileId, abs);
}
