import * as fs from "node:fs";
import * as path from "node:path";
import { findWorkbenchProjectRoot, parseHomeWorktreeCheckout, resolveWorkbenchHome } from "../workbench/home";
import { readProjectSlotMeta } from "../workbench/default-project";
import { ensureWorkbenchId, readWorkbenchJson } from "../workbench/identity";
import { libraryRel, projectSlotRel } from "../../shared/workbench/paths";
import { isRemoteProjectRoot } from "../../shared/remote";
import type { LibraryPaths } from "./types";

export function resolveLibraryProjectRoot(candidate: string): string {
  const trimmed = candidate?.trim();
  if (!trimmed) return "";
  if (isRemoteProjectRoot(trimmed)) {
    throw new Error("literature_not_on_remote_yet");
  }
  const resolved = path.resolve(trimmed);
  const checkout = parseHomeWorktreeCheckout(resolved);
  if (checkout) {
    const meta = readProjectSlotMeta(checkout.projectId);
    if (meta?.lastPath) return meta.lastPath;
  }
  return findWorkbenchProjectRoot(resolved) ?? resolved;
}

/** Home slot `~/.prismnext/projects/<id>/` for this paper folder (D-28). */
export function projectHomeSlotDir(projectRoot: string): string {
  const root = resolveLibraryProjectRoot(projectRoot);
  const projectId = ensureWorkbenchId(root);
  return path.join(resolveWorkbenchHome(), projectSlotRel(projectId));
}

export function getLibraryPaths(projectRoot: string): LibraryPaths {
  const root = resolveLibraryProjectRoot(projectRoot);
  const projectId = ensureWorkbenchId(root);
  const libraryDir = path.join(resolveWorkbenchHome(), libraryRel(projectId));
  return {
    libraryDir,
    dbPath: path.join(libraryDir, "library.db"),
    attachmentsDir: path.join(libraryDir, "attachments"),
    extractDir: path.join(libraryDir, "extract"),
  };
}

/** Map a display rel (`library/attachments/…`) to the home-slot file. Old `.prismnext/library/` → null (D-30). */
export function resolveLibraryDisplayAbs(projectRoot: string, displayRel: string): string | null {
  const norm = displayRel.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!norm || norm.includes("..") || norm.startsWith(".prismnext/")) return null;
  if (!norm.startsWith("library/")) return null;
  return path.join(getLibraryPaths(projectRoot).libraryDir, norm.slice("library/".length));
}

export function libraryDisplayRel(libraryRelPath: string): string {
  const norm = libraryRelPath.replace(/\\/g, "/").replace(/^\.\//, "");
  return norm.startsWith("library/") ? norm : `library/${norm}`;
}

export function ensureLibraryDirs(paths: LibraryPaths): void {
  fs.mkdirSync(paths.attachmentsDir, { recursive: true });
  fs.mkdirSync(paths.extractDir, { recursive: true });
}

/** Host dialog helper: selected folder must be a workbench project with a library slot. */
export function inspectWorkbenchLibrary(
  rootPath: string,
): { ok: true } | { ok: false; error: string } {
  const json = readWorkbenchJson(rootPath);
  if (!json) return { ok: false, error: "No workbench project in selected folder" };
  const libraryDb = path.join(resolveWorkbenchHome(), libraryRel(json.id), "library.db");
  if (!fs.existsSync(libraryDb)) return { ok: false, error: "No library in the workbench project slot" };
  return { ok: true };
}
